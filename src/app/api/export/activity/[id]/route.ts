import { requireTrainerApi } from "@/lib/auth";
import { handler, HttpError, toId } from "@/lib/http";
import { activityReport } from "@/lib/reports";
import { activityWorkbook } from "@/lib/excel";
import { getDict } from "@/lib/i18n-server";

export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await requireTrainerApi();
  const run = new URL(req.url).searchParams.get("run");
  const { d, lang } = await getDict();
  const rep = activityReport(t.id, toId((await ctx.params).id), run ? toId(run) : undefined, d);
  if (!rep.run) throw new HttpError(404, "no_runs");
  const buf = await activityWorkbook(rep, d, lang);
  const fname = `activity-${rep.activity.id}-run-${rep.run.number}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
});
