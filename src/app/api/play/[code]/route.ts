import { handler } from "@/lib/http";
import { codeRevUnchanged, traineeState } from "@/lib/live";
import { notModified, revParam } from "@/lib/poll";

export const GET = handler(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const code = (await ctx.params).code;
  const rev = revParam(req);
  if (rev !== null && (await codeRevUnchanged(code, rev))) return notModified();
  return Response.json(await traineeState(code), { headers: { "Cache-Control": "no-store" } });
});
