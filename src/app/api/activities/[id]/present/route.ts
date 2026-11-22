import { requireTrainerApi } from "@/lib/auth";
import { handler, toId } from "@/lib/http";
import { presenterState } from "@/lib/live";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await requireTrainerApi();
  return Response.json(presenterState(t.id, toId((await ctx.params).id)), { headers: { "Cache-Control": "no-store" } });
});
