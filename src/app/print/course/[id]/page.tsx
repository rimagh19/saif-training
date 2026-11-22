import { notFound } from "next/navigation";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { courseReport } from "@/lib/reports";
import { fmtDate, fmtDateTime } from "@/components/ui";
import { CourseReportBody } from "@/components/report-parts";
import { PrintShell } from "@/components/print-shell";

export default async function PrintCourse({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  let rep;
  try { rep = await courseReport(t.id, Number((await params).id), d); } catch { notFound(); }
  return (
    <PrintShell title={`${d.course_report}: ${rep.course.title}`} subtitle={`${rep.course.trainer_name} · ${fmtDate(rep.course.course_date, lang)}`}>
      <CourseReportBody rep={rep} d={d} lang={lang} />
      <p className="text-xs text-platinum mt-6">{d.generated_at}: {fmtDateTime(rep.generated_at, lang)}</p>
    </PrintShell>
  );
}
