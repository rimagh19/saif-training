import { requireTrainerApi } from "@/lib/auth";
import { handler, toId } from "@/lib/http";
import { trainerLiveState, trainerRevUnchanged } from "@/lib/live";
import { getDict } from "@/lib/i18n-server";
import { notModified, revParam } from "@/lib/poll";

export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  const rev = revParam(req);
  if (rev !== null && (await trainerRevUnchanged(t.id, id, rev))) return notModified();
  const { d } = await getDict();
  return Response.json(await trainerLiveState(t.id, id, d), { headers: { "Cache-Control": "no-store" } });
});
