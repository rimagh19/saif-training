import { requireTrainerApi } from "@/lib/auth";
import { handler, toId } from "@/lib/http";
import { getActivity } from "@/lib/repo";
import { REALTIME_MODE, sseResponse } from "@/lib/bus";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await requireTrainerApi();
  const a = await getActivity(t.id, toId((await ctx.params).id));
  // Serverless hosting (e.g. Vercel): no long-lived streams; clients poll instead.
  if (REALTIME_MODE !== "sse") return new Response(null, { status: 204 });
  return sseResponse(req, a.id);
});
