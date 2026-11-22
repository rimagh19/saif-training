import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, toId } from "@/lib/http";
import { syncFromBank } from "@/lib/bank";
import { getQuestion } from "@/lib/repo";
import { publish } from "@/lib/bus";

/** Update an activity copy to the latest version in the bank. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  const r = await syncFromBank(t.id, id);
  await publish((await getQuestion(t.id, id)).activity_id, "state");
  return Response.json(r);
});
