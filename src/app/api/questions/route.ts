import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, HttpError, readJson, toId } from "@/lib/http";
import { createQuestion } from "@/lib/repo";
import { validateQuestion } from "@/lib/questions";
import { publish } from "@/lib/bus";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  const v = validateQuestion(b);
  if (!v.ok) throw new HttpError(400, v.error);
  const activityId = toId(b.activity_id);
  const id = await createQuestion(t.id, activityId, v.value);
  await publish(activityId, "state");
  return Response.json({ id });
});
