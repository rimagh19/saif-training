"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "./modal";
import { api, ApiError } from "./api";
import { useI18n } from "./i18n";

export type CourseWithActivities = { id: number; title: string; activities: { id: number; title: string; status: string }[] };

/** Import bank questions into an existing activity (any course) or into a new activity. */
export function ImportDialog({ ids, courses, onClose, onDone }: { ids: number[]; courses: CourseWithActivities[]; onClose: () => void; onDone?: () => void }) {
  const { d, err } = useI18n();
  const [mode, setMode] = useState<"existing" | "new">(courses.some((c) => c.activities.length) ? "existing" : "new");
  const [courseId, setCourseId] = useState<number>(courses[0]?.id ?? 0);
  const course = courses.find((c) => c.id === courseId);
  const [activityId, setActivityId] = useState<number>(course?.activities[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ activity_id: number; count: number } | null>(null);

  return (
    <Modal title={`${d.import_to_activity} (${ids.length})`} onClose={onClose}>
      {done ? (
        <div className="text-center py-4">
          <CheckCircle2 size={44} className="mx-auto text-forest" />
          <p className="mt-3 text-lg font-bold">{d.import_done} <span className="num">({done.count})</span></p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href={`/activities/${done.activity_id}`} className="btn btn-primary">{d.go_to_activity}</Link>
            <button className="btn btn-outline" onClick={onClose}>{d.close}</button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const body = mode === "existing" ? { ids, activity_id: activityId } : { ids, new_activity: { course_id: courseId, title } };
              const r = await api<{ activity_id: number; created: number[] }>("/api/bank/import", "POST", body);
              setDone({ activity_id: r.activity_id, count: r.created.length });
              onDone?.();
            } catch (x) {
              setError(err(x instanceof ApiError ? x.code : undefined));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(["existing", "new"] as const).map((m) => (
              <button type="button" key={m} onClick={() => setMode(m)} className={`rounded-lg border py-2 font-bold ${mode === m ? "border-gold bg-gold/10 text-bronze" : "border-silver"}`}>
                {m === "existing" ? d.target_existing : d.target_new}
              </button>
            ))}
          </div>
          <div>
            <label className="label" htmlFor="imp-course">{d.choose_course}</label>
            <select
              id="imp-course"
              className="field"
              value={courseId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setCourseId(id);
                setActivityId(courses.find((c) => c.id === id)?.activities[0]?.id ?? 0);
              }}
            >
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          {mode === "existing" ? (
            <div>
              <label className="label" htmlFor="imp-act">{d.choose_activity}</label>
              <select id="imp-act" className="field" value={activityId} onChange={(e) => setActivityId(Number(e.target.value))} required>
                {!course?.activities.length && <option value={0}>—</option>}
                {course?.activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="imp-title">{d.new_activity_title}</label>
              <input id="imp-title" className="field" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}
          {error && <p role="alert" className="text-bronze font-bold">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy || !courseId || (mode === "existing" ? !activityId : !title.trim())}>{d.import_to_activity}</button>
        </form>
      )}
    </Modal>
  );
}
