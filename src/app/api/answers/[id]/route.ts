import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, readJson, toId } from "@/lib/http";
import { gradeAnswer } from "@/lib/live";

export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  await gradeAnswer(t.id, toId((await ctx.params).id), !!b.correct);
  return Response.json({ ok: true });
});
