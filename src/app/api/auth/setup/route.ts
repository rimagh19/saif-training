import { db, now, tx } from "@/lib/db";
import { assertSameOrigin, handler, HttpError, readJson, str } from "@/lib/http";
import { createTrainerSession, hashPassword } from "@/lib/auth";

/** One-time creation of the first trainer account. Closed as soon as any trainer exists. */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson(req);
  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "generic");
  if (password.length < 8) throw new HttpError(400, "weak_password");
  const id = tx(() => {
    const c = (db().prepare("SELECT COUNT(*) c FROM trainers").get() as { c: number }).c;
    if (c > 0) throw new HttpError(403, "setup_done");
    return Number(db().prepare("INSERT INTO trainers(name, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(name, email, hashPassword(password), now()).lastInsertRowid);
  });
  await createTrainerSession(id);
  return Response.json({ ok: true });
});
