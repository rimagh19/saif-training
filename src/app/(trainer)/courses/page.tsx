import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { listCourses } from "@/lib/repo";
import { CourseStatus, Empty, fmtDate, ModeBadge, PageHeader } from "@/components/ui";

export default async function Courses({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  const sp = await searchParams;
  const courses = await listCourses(t.id, { status: sp.status, q: sp.q });
  const tabs = [
    { v: undefined, label: d.all },
    { v: "draft", label: d.st_draft },
    { v: "active", label: d.st_active },
    { v: "completed", label: d.st_completed },
    { v: "archived", label: d.show_archived },
  ];
  return (
    <>
      <PageHeader
        title={d.courses_title}
        actions={<Link href="/courses/new" className="btn btn-primary"><Plus size={18} /> {d.new_course}</Link>}
      />
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {tabs.map((tb) => {
          const active = sp.status === tb.v;
          const href = tb.v ? `/courses?status=${tb.v}` : "/courses";
          return (
            <Link key={tb.label} href={href} className={`badge py-1.5 px-4 ${active ? "bg-navy text-white" : "bg-white border border-silver text-navy hover:border-gold"}`}>
              {tb.label}
            </Link>
          );
        })}
        <form className="ms-auto relative" action="/courses">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-platinum" />
          <input name="q" defaultValue={sp.q} placeholder={d.search} className="field !ps-9 !py-1.5 w-56" />
        </form>
      </div>
      {courses.length === 0 ? (
        <Empty text={d.no_courses} action={<Link href="/courses/new" className="btn btn-primary"><Plus size={18} /> {d.new_course}</Link>} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((c) => (
            <Link key={c.id} href={`/courses/${c.id}`} className="card p-5 hover:border-gold hover:shadow-sm transition group">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg group-hover:text-bronze transition-colors">{c.title}</h3>
                <CourseStatus status={c.status} d={d} />
              </div>
              <p className="text-sm text-platinum line-clamp-2 mt-1 min-h-[2.6em]">{c.description || "—"}</p>
              <div className="mt-3 flex flex-wrap gap-2 items-center text-sm text-platinum">
                <ModeBadge mode={c.mode} d={d} />
                <span>{fmtDate(c.course_date, lang)}</span>
                {c.trainer_name && <span>· {c.trainer_name}</span>}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center border-t border-silver/50 pt-3">
                <div><div className="font-bold num text-lg">{c.activity_count}</div><div className="text-xs text-platinum">{d.stat_activities}</div></div>
                <div><div className="font-bold num text-lg">{c.question_count}</div><div className="text-xs text-platinum">{d.stat_questions}</div></div>
                <div><div className="font-bold num text-lg">{c.participant_count}</div><div className="text-xs text-platinum">{d.stat_participants}</div></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
