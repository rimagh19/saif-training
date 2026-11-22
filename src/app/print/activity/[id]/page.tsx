import { notFound } from "next/navigation";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { activityReport } from "@/lib/reports";
import { fmtDateTime } from "@/components/ui";
import { ActivityReportBody } from "@/components/report-parts";
import { PrintShell } from "@/components/print-shell";

export default async function PrintActivity({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  const sp = await searchParams;
  let rep;
  try { rep = await activityReport(t.id, Number((await params).id), sp.run ? Number(sp.run) : undefined, d); } catch { notFound(); }
  if (!rep.run) notFound();
  return (
    <PrintShell title={`${d.activity_report}: ${rep.activity.title}`} subtitle={`${rep.activity.course_title} · ${d.run_n}${rep.run.number} · ${fmtDateTime(rep.run.started_at, lang)}`}>
      <ActivityReportBody rep={rep} d={d} lang={lang} print />
    </PrintShell>
  );
}
