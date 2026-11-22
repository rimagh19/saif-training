import { notFound } from "next/navigation";
import { FileSpreadsheet, FileText } from "lucide-react";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { activityReport } from "@/lib/reports";
import { Empty, fmtDateTime, PageHeader } from "@/components/ui";
import { ActivityReportBody } from "@/components/report-parts";
import { RunSelect } from "@/components/report-client";

export default async function ActivityReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  const sp = await searchParams;
  let rep;
  try { rep = await activityReport(t.id, Number((await params).id), sp.run ? Number(sp.run) : undefined, d); } catch { notFound(); }
  const a = rep.activity;
  return (
    <>
      <PageHeader
        back={{ href: `/activities/${a.id}`, label: a.title }}
        title={`${d.activity_report}: ${a.title}`}
        subtitle={rep.run ? `${a.course_title} · ${d.run_n}${rep.run.number} · ${fmtDateTime(rep.run.started_at, lang)}` : a.course_title}
        actions={
          rep.run && (
            <>
              {rep.runs.length > 1 && <RunSelect activityId={a.id} runs={rep.runs} current={rep.run.id} />}
              <a href={`/api/export/activity/${a.id}?run=${rep.run.id}`} className="btn btn-outline"><FileSpreadsheet size={17} /> {d.export_excel}</a>
              <a href={`/print/activity/${a.id}?run=${rep.run.id}`} target="_blank" rel="noreferrer" className="btn btn-primary"><FileText size={17} /> {d.export_pdf}</a>
            </>
          )
        }
      />
      {!rep.run ? <Empty text={d.no_runs} /> : <ActivityReportBody rep={rep} d={d} lang={lang} />}
    </>
  );
}
