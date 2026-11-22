import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, HttpError, readJson, toId } from "@/lib/http";
import { reorderQuestions } from "@/lib/repo";
import { publish } from "@/lib/bus";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  const b = await readJson(req);
  if (!Array.isArray(b.ids)) throw new HttpError(400, "invalid_order");
  await reorderQuestions(t.id, id, b.ids.map(Number));
  await publish(id, "state");
  return Response.json({ ok: true });
});
