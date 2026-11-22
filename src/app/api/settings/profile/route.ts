import { requireTrainerApi } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { assertSameOrigin, handler, HttpError, readJson, str } from "@/lib/http";

export const PATCH = handler(async (req: Request) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "generic");
  const clash = await get("SELECT id FROM trainers WHERE email = ? AND id != ?", email, t.id);
  if (clash) throw new HttpError(409, "email_taken");
  await run("UPDATE trainers SET name = ?, email = ? WHERE id = ?", name, email, t.id);
  return Response.json({ ok: true });
});
