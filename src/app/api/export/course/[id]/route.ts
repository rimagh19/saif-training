import { requireTrainerApi } from "@/lib/auth";
import { handler, toId } from "@/lib/http";
import { courseReport } from "@/lib/reports";
import { courseWorkbook } from "@/lib/excel";
import { getDict } from "@/lib/i18n-server";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const t = await requireTrainerApi();
  const { d, lang } = await getDict();
  const rep = courseReport(t.id, toId((await ctx.params).id), d);
  const buf = await courseWorkbook(rep, d, lang);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="course-${rep.course.id}.xlsx"`,
    },
  });
});
