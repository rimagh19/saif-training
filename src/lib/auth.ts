import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, now } from "./db";
import { HttpError } from "./http";

export const TRAINER_COOKIE = "safe_trainer";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

export type Trainer = { id: number; name: string; email: string };

// ---- password hashing (scrypt, built into Node) ----
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = () => crypto.randomBytes(32).toString("base64url");

// ---- brute-force protection ----
const WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
export function checkRateLimit(key: string, max = MAX_ATTEMPTS) {
  const row = db().prepare("SELECT count, first_at FROM login_attempts WHERE key = ?").get(key) as { count: number; first_at: number } | undefined;
  if (row && now() - row.first_at < WINDOW && row.count >= max) {
    throw new HttpError(429, "too_many_attempts");
  }
}
export function recordFailedAttempt(key: string) {
  const row = db().prepare("SELECT count, first_at FROM login_attempts WHERE key = ?").get(key) as { count: number; first_at: number } | undefined;
  if (!row || now() - row.first_at >= WINDOW) {
    db().prepare("INSERT OR REPLACE INTO login_attempts(key, count, first_at) VALUES (?, 1, ?)").run(key, now());
  } else {
    db().prepare("UPDATE login_attempts SET count = count + 1 WHERE key = ?").run(key);
  }
}
export function clearAttempts(key: string) {
  db().prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
}

/**
 * Client address used for rate limiting. X-Forwarded-For can be forged by anyone,
 * so it is only trusted when TRUST_PROXY=true (i.e. behind a proxy that sets it).
 */
export async function clientIp(): Promise<string> {
  if (process.env.TRUST_PROXY !== "true") return "direct";
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || "direct";
}

// ---- sessions ----
const secureCookies = () => process.env.COOKIE_SECURE === "true";

export async function createTrainerSession(trainerId: number) {
  const token = randomToken();
  db().prepare("INSERT INTO trainer_sessions(token_hash, trainer_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), trainerId, now() + SESSION_TTL);
  db().prepare("DELETE FROM trainer_sessions WHERE expires_at < ?").run(now());
  const jar = await cookies();
  jar.set(TRAINER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: SESSION_TTL / 1000,
  });
}

export async function destroyTrainerSession() {
  const jar = await cookies();
  const token = jar.get(TRAINER_COOKIE)?.value;
  if (token) db().prepare("DELETE FROM trainer_sessions WHERE token_hash = ?").run(sha256(token));
  jar.delete(TRAINER_COOKIE);
}

export async function currentTrainer(): Promise<Trainer | null> {
  const jar = await cookies();
  const token = jar.get(TRAINER_COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT t.id, t.name, t.email FROM trainer_sessions s JOIN trainers t ON t.id = s.trainer_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(sha256(token), now()) as Trainer | undefined;
  return row ?? null;
}

/** For server components/pages: redirect to login when not signed in. */
export async function requireTrainerPage(): Promise<Trainer> {
  const t = await currentTrainer();
  if (!t) redirect("/login");
  return t;
}

/** For route handlers: 401 when not signed in. */
export async function requireTrainerApi(): Promise<Trainer> {
  const t = await currentTrainer();
  if (!t) throw new HttpError(401, "unauthorized");
  return t;
}

export function trainerCount(): number {
  return (db().prepare("SELECT COUNT(*) c FROM trainers").get() as { c: number }).c;
}
