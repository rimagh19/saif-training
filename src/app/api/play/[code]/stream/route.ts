import { handler } from "@/lib/http";
import { activityByCode } from "@/lib/live";
import { sseResponse } from "@/lib/bus";

export const dynamic = "force-dynamic";

/** Trainee event stream: carries only "changed" signals, never data. */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const a = await activityByCode((await ctx.params).code);
  return sseResponse(req, a.id);
});
