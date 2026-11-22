import { get } from "@/lib/db";
import { assertSameOrigin, handler, HttpError, readJson, str } from "@/lib/http";
import { checkRateLimit, clearAttempts, clientIp, createTrainerSession, recordFailedAttempt, verifyPassword } from "@/lib/auth";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson(req);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const ip = await clientIp();
  const key = `login:${email}:${ip}`;
  await checkRateLimit(key);
  const row = await get("SELECT id, password_hash FROM trainers WHERE email = ?", email) as { id: number; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    await recordFailedAttempt(key);
    throw new HttpError(401, "invalid_credentials");
  }
  await clearAttempts(key);
  await createTrainerSession(row.id);
  return Response.json({ ok: true });
});
