import { hashPassword, requireTrainerApi, verifyPassword } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { assertSameOrigin, handler, HttpError, readJson } from "@/lib/http";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  const row = await get("SELECT password_hash FROM trainers WHERE id = ?", t.id) as { password_hash: string };
  if (!verifyPassword(String(b.current ?? ""), row.password_hash)) throw new HttpError(400, "wrong_password");
  const next = String(b.next ?? "");
  if (next.length < 8) throw new HttpError(400, "weak_password");
  await run("UPDATE trainers SET password_hash = ? WHERE id = ?", hashPassword(next), t.id);
  return Response.json({ ok: true });
});
