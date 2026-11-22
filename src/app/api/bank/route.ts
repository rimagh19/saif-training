import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, HttpError, readJson } from "@/lib/http";
import { bankMetaInput, createBankQuestion, searchBank, type BankFilter } from "@/lib/bank";
import { validateQuestion } from "@/lib/questions";

export const GET = handler(async (req: Request) => {
  const t = await requireTrainerApi();
  const p = new URL(req.url).searchParams;
  const f: BankFilter = {
    q: p.get("q")?.slice(0, 200) || undefined,
    domain: p.get("domain") || undefined,
    specialty: p.get("specialty") || undefined,
    topic: p.get("topic") || undefined,
    tag: p.getAll("tag").filter(Boolean).slice(0, 10),
    difficulty: p.get("difficulty") || undefined,
    type: p.get("type") || undefined,
    status: (["active", "archived", "all"].includes(p.get("status") ?? "") ? p.get("status") : "active") as BankFilter["status"],
    sort: (["recent", "usage", "title", "oldest"].includes(p.get("sort") ?? "") ? p.get("sort") : "recent") as BankFilter["sort"],
    limit: Number(p.get("limit")) || 50,
    offset: Number(p.get("offset")) || 0,
  };
  return Response.json(await searchBank(t.id, f));
});

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const b = await readJson(req);
  const v = validateQuestion(b);
  if (!v.ok) throw new HttpError(400, v.error);
  return Response.json({ id: await createBankQuestion(t.id, v.value, bankMetaInput(b)) });
});
