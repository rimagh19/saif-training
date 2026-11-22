import { assertSameOrigin, handler, readJson, toId } from "@/lib/http";
import { submitAnswer } from "@/lib/live";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  assertSameOrigin(req);
  const b = await readJson(req);
  return Response.json(await submitAnswer((await ctx.params).code, toId(b.question_id), b.answer));
});
