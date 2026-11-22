import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, readJson } from "@/lib/http";
import { createCourse } from "@/lib/repo";
import { courseInput } from "@/lib/validate";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const id = createCourse(t.id, courseInput(await readJson(req)));
  return Response.json({ id });
});
