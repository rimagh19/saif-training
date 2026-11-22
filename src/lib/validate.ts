import "server-only";
import { HttpError, str } from "./http";
import type { Course } from "./repo";

export function courseInput(b: Record<string, unknown>, partial = false): Partial<Course> {
  const out: Partial<Course> = {};
  if (!partial || "title" in b) {
    out.title = str(b.title, 200);
    if (!out.title) throw new HttpError(400, "title_required");
  }
  if (!partial || "description" in b) out.description = str(b.description, 4000);
  if (!partial || "trainer_name" in b) out.trainer_name = str(b.trainer_name, 120);
  if (!partial || "course_date" in b) {
    const dt = str(b.course_date, 10);
    out.course_date = /^\d{4}-\d{2}-\d{2}$/.test(dt) ? dt : null;
  }
  if (!partial || "mode" in b) out.mode = b.mode === "remote" ? "remote" : "onsite";
  if (!partial || "status" in b) {
    const s = String(b.status ?? "draft");
    out.status = (["draft", "active", "completed", "archived"].includes(s) ? s : "draft") as Course["status"];
  }
  return out;
}
