import { handler } from "@/lib/http";
import { traineeState } from "@/lib/live";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ code: string }> }) => {
  return Response.json(await traineeState((await ctx.params).code), { headers: { "Cache-Control": "no-store" } });
});
