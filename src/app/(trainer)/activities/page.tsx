import Link from "next/link";
import { Pencil, Play } from "lucide-react";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { listActivities, listCourses } from "@/lib/repo";
import { ActivityStatus, Empty, ModeBadge, PageHeader } from "@/components/ui";
import { NewActivityForm } from "@/components/course-actions";

export default async function Activities({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const t = await requireTrainerPage();
  const { d } = await getDict();
  const sp = await searchParams;
  const acts = await listActivities(t.id, { status: sp.status });
  const courses = (await listCourses(t.id)).map((c) => ({ id: c.id, title: c.title }));
  const tabs = [
    { v: undefined, label: d.all },
    { v: "live", label: d.act_live },
    { v: "draft", label: d.act_draft },
    { v: "ended", label: d.act_ended },
  ];
  return (
    <>
      <PageHeader title={d.activities_title} />
      {courses.length > 0 && <div className="card p-4 mb-5"><NewActivityForm courses={courses} /></div>}
      <div className="flex flex-wrap gap-2 mb-5">
        {tabs.map((tb) => (
          <Link key={tb.label} href={tb.v ? `/activities?status=${tb.v}` : "/activities"} className={`badge py-1.5 px-4 ${sp.status === tb.v ? "bg-navy text-white" : "bg-white border border-silver hover:border-gold"}`}>{tb.label}</Link>
        ))}
      </div>
      {acts.length === 0 ? (
        <Empty text={d.no_activities} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>{d.activity_name}</th><th>{d.nav_courses}</th><th>{d.status}</th><th>{d.questions_count}</th><th>{d.participants_count}</th><th>{d.join_code}</th><th></th></tr></thead>
            <tbody>
              {acts.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/activities/${a.id}`} className="font-bold hover:text-bronze">{a.title}</Link></td>
                  <td><div className="flex items-center gap-2"><Link href={`/courses/${a.course_id}`} className="text-sm hover:text-bronze">{a.course_title}</Link><ModeBadge mode={a.course_mode} d={d} /></div></td>
                  <td><ActivityStatus status={a.status} d={d} /></td>
                  <td className="num">{a.question_count}</td>
                  <td className="num">{a.participant_count}</td>
                  <td className="num" dir="ltr">{a.join_code}</td>
                  <td className="text-end whitespace-nowrap">
                    <Link href={`/activities/${a.id}`} className="btn btn-ghost text-sm"><Pencil size={15} /></Link>
                    <Link href={`/activities/${a.id}/live`} className="btn btn-dark text-sm"><Play size={15} /> {a.status === "live" ? d.open_control : d.run_activity}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
