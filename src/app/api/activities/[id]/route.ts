import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, readJson, str, toId } from "@/lib/http";
import { deleteActivity, getActivity, regenerateJoinCode, updateActivity } from "@/lib/repo";
import { publish } from "@/lib/bus";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  const b = await readJson(req);
  if (b.regenerate_code) {
    await regenerateJoinCode(t.id, id);
  } else {
    const data: Parameters<typeof updateActivity>[2] = {};
    if ("title" in b) data.title = str(b.title, 200) || (await getActivity(t.id, id)).title;
    if ("description" in b) data.description = str(b.description, 4000);
    if ("identity_mode" in b) data.identity_mode = b.identity_mode === "name" ? "name" : "name_id";
    if ("allow_change" in b) data.allow_change = b.allow_change ? 1 : 0;
    if ("allow_late_edit" in b) data.allow_late_edit = b.allow_late_edit ? 1 : 0;
    if ("reveal_to_trainees" in b) data.reveal_to_trainees = b.reveal_to_trainees ? 1 : 0;
    if ("show_leaderboard" in b) data.show_leaderboard = b.show_leaderboard ? 1 : 0;
    await updateActivity(t.id, id, data);
  }
  await publish(id, "state");
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  await deleteActivity(t.id, id);
  await publish(id, "state");
  return Response.json({ ok: true });
});
