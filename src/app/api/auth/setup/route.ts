import { get, now, run, tx } from "@/lib/db";
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
  const id = await tx(async () => {
      const c = (await get("SELECT COUNT(*) c FROM trainers") as { c: number }).c;
      if (c > 0) throw new HttpError(403, "setup_done");
      return (await run("INSERT INTO trainers(name, email, password_hash, created_at) VALUES (?, ?, ?, ?)", name, email, hashPassword(password), now())).lastId;
    });
  await createTrainerSession(id);
  return Response.json({ ok: true });
});
