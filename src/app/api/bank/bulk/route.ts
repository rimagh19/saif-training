import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, HttpError, readJson, str } from "@/lib/http";
import { addTagToMany, getBankQuestion, setBankStatus } from "@/lib/bank";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500) : [];
  if (ids.length === 0) throw new HttpError(400, "select_questions");
  ids.forEach((id) => getBankQuestion(t.id, id)); // ownership check for every id
  switch (b.action) {
    case "archive":
      setBankStatus(t.id, ids, "archived");
      break;
    case "restore":
      setBankStatus(t.id, ids, "active");
      break;
    case "add_tag":
      addTagToMany(t.id, ids, str(b.tag, 40));
      break;
    default:
      throw new HttpError(400, "unknown_action");
  }
  return Response.json({ ok: true, count: ids.length });
});
