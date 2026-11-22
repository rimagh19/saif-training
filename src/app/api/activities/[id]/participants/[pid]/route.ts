import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, toId } from "@/lib/http";
import { removeParticipant } from "@/lib/live";

export const DELETE = handler(async (req: Request, ctx: { params: Promise<{ id: string; pid: string }> }) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const p = await ctx.params;
  removeParticipant(t.id, toId(p.id), toId(p.pid));
  return Response.json({ ok: true });
});
