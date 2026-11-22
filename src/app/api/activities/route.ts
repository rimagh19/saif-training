import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, HttpError, readJson, str, toId } from "@/lib/http";
import { createActivity } from "@/lib/repo";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  const title = str(b.title, 200);
  if (!title) throw new HttpError(400, "title_required");
  const id = createActivity(t.id, toId(b.course_id), { title, description: str(b.description, 4000) });
  return Response.json({ id });
});
