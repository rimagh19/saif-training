import Link from "next/link";
import { BookOpen, GraduationCap, Plus, Radio, Users } from "lucide-react";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { dashboardStats, listActivities, listCourses } from "@/lib/repo";
import { recentRuns } from "@/lib/reports";
import { ActivityStatus, Bar, CourseStatus, Empty, fmtDate, fmtDateTime, ModeBadge, PageHeader, StatCard } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  const stats = await dashboardStats(t.id);
  const courses = (await listCourses(t.id)).slice(0, 5);
  const live = await listActivities(t.id, { status: "live" });
  const results = await recentRuns(t.id, 5);

  return (
    <>
      <PageHeader
        title={lang === "ar" ? `${d.dash_welcome}، ${t.name}` : `${d.dash_welcome}, ${t.name}`}
        subtitle={d.dash_title}
        actions={
          <Link href="/courses/new" className="btn btn-primary">
            <Plus size={18} /> {d.new_course}
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={d.stat_courses} value={stats.courses} icon={<GraduationCap size={22} />} />
        <StatCard label={d.stat_activities} value={stats.activities} icon={<Radio size={22} />} />
        <StatCard label={d.stat_questions} value={stats.questions} icon={<BookOpen size={22} />} />
        <StatCard label={d.stat_participants} value={stats.participants} icon={<Users size={22} />} />
      </div>

      {stats.courses === 0 ? (
        <div className="mt-8">
          <Empty text={d.empty_dash} action={<Link href="/courses/new" className="btn btn-primary"><Plus size={18} /> {d.new_course}</Link>} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6 mt-8">
          <section className="lg:col-span-2 card p-5">
            <h2 className="text-xl mb-4">{d.live_now}</h2>
            {live.length === 0 ? (
              <p className="text-platinum">{d.no_live}</p>
            ) : (
              <ul className="divide-y divide-silver/40">
                {live.map((a) => (
                  <li key={a.id} className="py-3 flex flex-wrap items-center gap-3">
                    <ActivityStatus status={a.status} d={d} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{a.title}</div>
                      <div className="text-sm text-platinum truncate">{a.course_title}</div>
                    </div>
                    <span className="text-sm text-platinum">{d.join_code}: <b className="num text-navy" dir="ltr">{a.join_code}</b></span>
                    <Link href={`/activities/${a.id}/live`} className="btn btn-dark text-sm">{d.open_control}</Link>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="text-xl mt-8 mb-4">{d.recent_results}</h2>
            {results.length === 0 ? (
              <p className="text-platinum">{d.none_yet}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{d.nav_activities}</th>
                      <th>{d.date}</th>
                      <th>{d.participants}</th>
                      <th className="w-40">{d.avg_result}</th>
                      <th>{d.participation_rate}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.run_id}>
                        <td>
                          <div className="font-bold">{r.activity_title}</div>
                          <div className="text-xs text-platinum">{r.course_title} · {d.run_n}{r.number}</div>
                        </td>
                        <td className="text-sm text-platinum whitespace-nowrap">{fmtDateTime(r.started_at, lang)}</td>
                        <td className="num">{r.summary?.participants ?? 0}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="num font-bold w-12">{r.summary?.average_percent ?? 0}%</span>
                            <Bar value={r.summary?.average_percent ?? 0} />
                          </div>
                        </td>
                        <td className="num">{r.summary?.participation_rate ?? 0}%</td>
                        <td><Link className="text-bronze font-bold text-sm whitespace-nowrap" href={`/reports/activity/${r.activity_id}?run=${r.run_id}`}>{d.view_report}</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl">{d.recent_courses}</h2>
              <Link href="/courses" className="text-sm text-bronze font-bold">{d.view}</Link>
            </div>
            <ul className="space-y-3">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link href={`/courses/${c.id}`} className="block rounded-xl border border-silver/50 p-3 hover:border-gold transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold truncate">{c.title}</span>
                      <CourseStatus status={c.status} d={d} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-platinum">
                      <ModeBadge mode={c.mode} d={d} />
                      <span>{fmtDate(c.course_date, lang)}</span>
                      <span>· {c.activity_count} {d.stat_activities}</span>
                      <span>· {c.question_count} {d.stat_questions}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
