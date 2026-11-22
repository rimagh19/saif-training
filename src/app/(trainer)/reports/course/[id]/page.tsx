import { notFound } from "next/navigation";
import { FileSpreadsheet, FileText } from "lucide-react";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { courseReport } from "@/lib/reports";
import { fmtDate, PageHeader } from "@/components/ui";
import { CourseReportBody } from "@/components/report-parts";

export default async function CourseReportPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  let rep;
  try { rep = await courseReport(t.id, Number((await params).id), d); } catch { notFound(); }
  return (
    <>
      <PageHeader
        back={{ href: `/courses/${rep.course.id}`, label: rep.course.title }}
        title={`${d.course_report}: ${rep.course.title}`}
        subtitle={`${rep.course.trainer_name} · ${fmtDate(rep.course.course_date, lang)} · ${rep.course.mode === "remote" ? d.mode_remote : d.mode_onsite}`}
        actions={
          <>
            <a href={`/api/export/course/${rep.course.id}`} className="btn btn-outline"><FileSpreadsheet size={17} /> {d.export_excel}</a>
            <a href={`/print/course/${rep.course.id}`} target="_blank" rel="noreferrer" className="btn btn-primary"><FileText size={17} /> {d.export_pdf}</a>
          </>
        }
      />
      <CourseReportBody rep={rep} d={d} lang={lang} />
    </>
  );
}
