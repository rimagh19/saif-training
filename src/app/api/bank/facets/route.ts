import { requireTrainerApi } from "@/lib/auth";
import { handler } from "@/lib/http";
import { bankFacets } from "@/lib/bank";

export const GET = handler(async (req: Request) => {
  const t = await requireTrainerApi();
  const s = new URL(req.url).searchParams.get("status");
  return Response.json(await bankFacets(t.id, s === "archived" || s === "all" ? s : "active"));
});
