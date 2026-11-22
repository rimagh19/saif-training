import { requireTrainerApi } from "@/lib/auth";
import { assertSameOrigin, handler, HttpError, readJson, toId } from "@/lib/http";
import { bankMetaInput, bankUsage, deleteBankQuestion, getBankQuestion, setBankStatus, updateBankQuestion } from "@/lib/bank";
import { validateQuestion } from "@/lib/questions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  return Response.json({ ...getBankQuestion(t.id, id), used_in: bankUsage(t.id, id) });
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  const id = toId((await ctx.params).id);
  const b = await readJson(req);
  // status-only change (archive / restore); a full edit always carries the question type
  if (!("type" in b) && (b.status === "archived" || b.status === "active")) {
    getBankQuestion(t.id, id);
    setBankStatus(t.id, [id], b.status);
    return Response.json({ ok: true });
  }
  const v = validateQuestion(b);
  if (!v.ok) throw new HttpError(400, v.error);
  updateBankQuestion(t.id, id, v.value, bankMetaInput(b));
  return Response.json({ ok: true, version: getBankQuestion(t.id, id).version });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const t = await requireTrainerApi();
  deleteBankQuestion(t.id, toId((await ctx.params).id));
  return Response.json({ ok: true });
});
