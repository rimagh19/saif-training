import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, readJson, toId } from "@/lib/http";
import { bankMetaInput, saveQuestionToBank } from "@/lib/bank";

/** Save an activity question into the central bank. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  return Response.json({ bank_id: saveQuestionToBank(t.id, toId((await ctx.params).id), bankMetaInput(b)) });
});
