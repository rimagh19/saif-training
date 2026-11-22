import { requireTrainerApi } from "@/lib/auth";
import { handler, toId } from "@/lib/http";
import { trainerLiveState } from "@/lib/live";
import { getDict } from "@/lib/i18n-server";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await requireTrainerApi();
  const { d } = await getDict();
  return Response.json(trainerLiveState(t.id, toId((await ctx.params).id), d), { headers: { "Cache-Control": "no-store" } });
});
