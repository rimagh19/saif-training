import { assertSameOrigin, handler, readJson, str } from "@/lib/http";
import { joinActivity } from "@/lib/live";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  assertSameOrigin(req);
  const b = await readJson(req);
  await joinActivity((await ctx.params).code, str(b.name, 80), str(b.trainee_number, 40));
  return Response.json({ ok: true });
});
