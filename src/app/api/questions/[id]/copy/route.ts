import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, readJson, toId } from "@/lib/http";
import { copyQuestion } from "@/lib/repo";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  const id = copyQuestion(t.id, toId((await ctx.params).id), toId(b.activity_id));
  return Response.json({ id });
});
