import { requireTrainerApi } from "@/lib/auth";
import { handler, toId } from "@/lib/http";
import { getActivity } from "@/lib/repo";
import { sseResponse } from "@/lib/bus";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await requireTrainerApi();
  const a = getActivity(t.id, toId((await ctx.params).id));
  return sseResponse(req, a.id);
});
