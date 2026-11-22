import { handler } from "@/lib/http";
import { activityByCode } from "@/lib/live";
import { REALTIME_MODE, sseResponse } from "@/lib/bus";

export const dynamic = "force-dynamic";

/** Trainee event stream: carries only "changed" signals, never data. */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  // Serverless hosting (e.g. Vercel): no long-lived streams; clients poll instead.
  if (REALTIME_MODE !== "sse") return new Response(null, { status: 204 });
  const a = await activityByCode((await ctx.params).code);
  return sseResponse(req, a.id);
});
