import Link from "next/link";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { listCourses } from "@/lib/repo";
import { recentRuns } from "@/lib/reports";
import { Bar, CourseStatus, Empty, fmtDate, fmtDateTime, PageHeader } from "@/components/ui";

export default async function Reports() {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  const runs = recentRuns(t.id, 30);
  const courses = listCourses(t.id, { status: "all" });
  return (
    <>
      <PageHeader title={d.reports_title} />
      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 card p-5">
          <h2 className="text-xl mb-4">{d.recent_results}</h2>
          {runs.length === 0 ? <Empty text={d.none_yet} /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>{d.nav_activities}</th><th>{d.date}</th><th>{d.participants}</th><th className="w-40">{d.avg_result}</th><th>{d.participation_rate}</th><th>{d.hardest_q}</th><th></th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.run_id}>
                      <td><div className="font-bold">{r.activity_title}</div><div className="text-xs text-platinum">{r.course_title} · {d.run_n}{r.number}</div></td>
                      <td className="text-sm whitespace-nowrap">{fmtDateTime(r.started_at, lang)}</td>
                      <td className="num">{r.summary?.participants ?? 0}</td>
                      <td><div className="flex items-center gap-2"><span className="num font-bold w-12">{r.summary?.average_percent ?? 0}%</span><Bar value={r.summary?.average_percent ?? 0} /></div></td>
                      <td className="num">{r.summary?.participation_rate ?? 0}%</td>
                      <td className="text-sm max-w-48 truncate">{r.hardest && r.hardest.wrong > 0 ? r.hardest.title : "—"}</td>
                      <td><Link href={`/reports/activity/${r.activity_id}?run=${r.run_id}`} className="text-bronze font-bold text-sm whitespace-nowrap">{d.view_report}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card p-5 h-fit">
          <h2 className="text-xl mb-4">{d.course_report}</h2>
          <ul className="space-y-2">
            {courses.map((c) => (
              <li key={c.id}>
                <Link href={`/reports/course/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-silver/50 px-3 py-2 hover:border-gold">
                  <span className="min-w-0"><span className="block font-bold truncate">{c.title}</span><span className="text-xs text-platinum">{fmtDate(c.course_date, lang)} · {c.participant_count} {d.stat_participants}</span></span>
                  <CourseStatus status={c.status} d={d} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
