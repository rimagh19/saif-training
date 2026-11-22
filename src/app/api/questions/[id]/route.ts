import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, HttpError, readJson, toId } from "@/lib/http";
import { deleteQuestion, getQuestion, updateQuestion } from "@/lib/repo";
import { validateQuestion } from "@/lib/questions";
import { publish } from "@/lib/bus";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const t = await requireTrainerApi();
  return Response.json(await getQuestion(t.id, toId((await ctx.params).id)));
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  const v = validateQuestion(await readJson(req));
  if (!v.ok) throw new HttpError(400, v.error);
  const q = await getQuestion(t.id, id);
  await updateQuestion(t.id, id, v.value);
  await publish(q.activity_id, "state");
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  const q = await getQuestion(t.id, id);
  await deleteQuestion(t.id, id);
  await publish(q.activity_id, "state");
  return Response.json({ ok: true });
});
