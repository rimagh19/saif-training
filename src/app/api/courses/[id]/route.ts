import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, readJson, toId } from "@/lib/http";
import { deleteCourse, getCourse, updateCourse } from "@/lib/repo";
import { courseInput } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const t = await requireTrainerApi();
  return Response.json(await getCourse(t.id, toId((await ctx.params).id)));
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  await updateCourse(t.id, toId((await ctx.params).id), courseInput(await readJson(req), true));
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  await deleteCourse(t.id, toId((await ctx.params).id));
  return Response.json({ ok: true });
});
