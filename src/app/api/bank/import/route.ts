import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, HttpError, readJson, str, toId } from "@/lib/http";
import { importToActivity } from "@/lib/bank";
import { publish } from "@/lib/bus";

/** Body: { ids: number[], activity_id } or { ids, new_activity: { course_id, title } } */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number))] : [];
  let target: Parameters<typeof importToActivity>[2];
  if (b.activity_id) target = { activityId: toId(b.activity_id) };
  else if (b.new_activity && typeof b.new_activity === "object") {
    const na = b.new_activity as Record<string, unknown>;
    const title = str(na.title, 200);
    if (!title) throw new HttpError(400, "title_required");
    target = { newActivity: { courseId: toId(na.course_id), title } };
  } else throw new HttpError(400, "target_required");
  const r = importToActivity(t.id, ids.map((i) => toId(i)), target);
  publish(r.activityId, "state");
  return Response.json({ activity_id: r.activityId, created: r.created });
});
