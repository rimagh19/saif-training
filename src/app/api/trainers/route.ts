import { hashPassword, requireTrainerApi } from "@/lib/auth";
import { get, now, run } from "@/lib/db";
import { assertSameOrigin, handler, HttpError, readJson, str } from "@/lib/http";

/** Any signed-in trainer can create another trainer account; each account's data stays isolated. */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireTrainerApi();
  const b = await readJson(req);
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const password = String(b.password ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "generic");
  if (password.length < 8) throw new HttpError(400, "weak_password");
  if (await get("SELECT 1 FROM trainers WHERE email = ?", email)) throw new HttpError(409, "email_taken");
  await run("INSERT INTO trainers(name, email, password_hash, created_at) VALUES (?, ?, ?, ?)", name, email, hashPassword(password), now());
  return Response.json({ ok: true });
});
