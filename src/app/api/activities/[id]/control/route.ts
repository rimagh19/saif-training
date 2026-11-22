import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, readJson, toId } from "@/lib/http";
import { control, type ControlAction } from "@/lib/live";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  control(t.id, toId((await ctx.params).id), String(b.action) as ControlAction, {
    questionId: b.questionId !== undefined ? Number(b.questionId) : undefined,
    seconds: b.seconds !== undefined ? Number(b.seconds) : undefined,
    value: b.value !== undefined ? !!b.value : undefined,
  });
  return Response.json({ ok: true });
});
