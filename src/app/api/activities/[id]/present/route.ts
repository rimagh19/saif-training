import { requireTrainerApi } from "@/lib/auth";
import { handler, toId } from "@/lib/http";
import { presenterState, trainerRevUnchanged } from "@/lib/live";
import { notModified, revParam } from "@/lib/poll";

export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  const rev = revParam(req);
  if (rev !== null && (await trainerRevUnchanged(t.id, id, rev))) return notModified();
  return Response.json(await presenterState(t.id, id), { headers: { "Cache-Control": "no-store" } });
});
