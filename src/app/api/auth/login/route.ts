import { db } from "@/lib/db";
import { assertSameOrigin, handler, HttpError, readJson, str } from "@/lib/http";
import { checkRateLimit, clearAttempts, clientIp, createTrainerSession, recordFailedAttempt, verifyPassword } from "@/lib/auth";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson(req);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const ip = await clientIp();
  const key = `login:${email}:${ip}`;
  checkRateLimit(key);
  const row = db().prepare("SELECT id, password_hash FROM trainers WHERE email = ?").get(email) as { id: number; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    recordFailedAttempt(key);
    throw new HttpError(401, "invalid_credentials");
  }
  clearAttempts(key);
  await createTrainerSession(row.id);
  return Response.json({ ok: true });
});
