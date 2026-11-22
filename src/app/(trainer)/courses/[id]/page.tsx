import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, CalendarDays, Pencil, Play, User } from "lucide-react";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { getCourse, listActivities } from "@/lib/repo";
import { courseReport } from "@/lib/reports";
import { ActivityStatus, Bar, CourseStatus, Empty, fmtDate, fmtDateTime, ModeBadge, PageHeader, StatCard } from "@/components/ui";
import { CourseActions, NewActivityForm } from "@/components/course-actions";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  let course;
  try { course = await getCourse(t.id, Number((await params).id)); } catch { notFound(); }
  const activities = await listActivities(t.id, { courseId: course.id });
  const report = await courseReport(t.id, course.id);
  const qCount = activities.reduce((s, a) => s + a.question_count, 0);
  const pCount = activities.reduce((s, a) => s + a.participant_count, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/courses", label: d.courses_title }}
        title={course.title}
        subtitle={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <CourseStatus status={course.status} d={d} />
            <ModeBadge mode={course.mode} d={d} />
            <span className="flex items-center gap-1"><CalendarDays size={15} /> {fmtDate(course.course_date, lang)}</span>
            {course.trainer_name && <span className="flex items-center gap-1"><User size={15} /> {course.trainer_name}</span>}
          </div>
        }
        actions={
          <>
            <Link href={`/reports/course/${course.id}`} className="btn btn-outline"><BarChart3 size={17} /> {d.course_report}</Link>
            <Link href={`/courses/${course.id}/edit`} className="btn btn-outline"><Pencil size={17} /> {d.edit}</Link>
            <CourseActions id={course.id} status={course.status} />
          </>
        }
      />
      {course.description && <p className="text-navy/80 mb-6 max-w-3xl whitespace-pre-line">{course.description}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label={d.stat_activities} value={activities.length} />
        <StatCard label={d.questions_count} value={qCount} />
        <StatCard label={d.participants_count} value={pCount} />
        <StatCard label={d.avg_result} value={`${report.summary.average_percent}%`} />
      </div>

      <section className="card p-5 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl">{d.course_activities}</h2>
          <NewActivityForm courseId={course.id} />
        </div>
        {activities.length === 0 ? (
          <Empty text={d.no_activities} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>{d.activity_name}</th><th>{d.status}</th><th>{d.questions_count}</th><th>{d.runs_count}</th><th>{d.participants_count}</th><th>{d.join_code}</th><th></th></tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/activities/${a.id}`} className="font-bold hover:text-bronze">{a.title}</Link></td>
                    <td><ActivityStatus status={a.status} d={d} /></td>
                    <td className="num">{a.question_count}</td>
                    <td className="num">{a.run_count}</td>
                    <td className="num">{a.participant_count}</td>
                    <td className="num" dir="ltr">{a.join_code}</td>
                    <td className="text-end whitespace-nowrap">
                      <Link href={`/activities/${a.id}`} className="btn btn-ghost text-sm"><Pencil size={15} /> {d.edit}</Link>
                      <Link href={`/activities/${a.id}/live`} className="btn btn-dark text-sm"><Play size={15} /> {d.run_activity}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-xl mb-4">{d.previous_results}</h2>
        {report.activities.filter((a) => a.run).length === 0 ? (
          <p className="text-platinum">{d.none_yet}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{d.activity_name}</th><th>{d.run}</th><th>{d.participants}</th><th className="w-48">{d.avg_result}</th><th>{d.participation_rate}</th><th></th></tr></thead>
              <tbody>
                {report.activities.filter((a) => a.run).map((a) => (
                  <tr key={a.id}>
                    <td className="font-bold">{a.title}</td>
                    <td className="text-sm text-platinum">{d.run_n}{a.run!.number} · {fmtDateTime(a.run!.started_at, lang)}</td>
                    <td className="num">{a.summary!.participants}</td>
                    <td><div className="flex items-center gap-2"><span className="num font-bold w-12">{a.summary!.average_percent}%</span><Bar value={a.summary!.average_percent} /></div></td>
                    <td className="num">{a.summary!.participation_rate}%</td>
                    <td><Link href={`/reports/activity/${a.id}`} className="text-bronze font-bold text-sm">{d.view_report}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
