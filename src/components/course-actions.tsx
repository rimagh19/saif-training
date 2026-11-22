"use client";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { api } from "./api";
import { useI18n } from "./i18n";

export function CourseActions({ id, status }: { id: number; status: string }) {
  const { d } = useI18n();
  const router = useRouter();
  return (
    <>
      <button
        className="btn btn-outline"
        onClick={async () => {
          await api(`/api/courses/${id}`, "PATCH", { status: status === "archived" ? "completed" : "archived" });
          router.refresh();
        }}
      >
        {status === "archived" ? <ArchiveRestore size={17} /> : <Archive size={17} />}
        {status === "archived" ? d.unarchive : d.archive}
      </button>
      <button
        className="btn btn-danger"
        onClick={async () => {
          if (!confirm(d.confirm_delete)) return;
          await api(`/api/courses/${id}`, "DELETE");
          router.push("/courses");
          router.refresh();
        }}
      >
        <Trash2 size={17} /> {d.delete}
      </button>
    </>
  );
}

export function NewActivityForm({ courseId, courses }: { courseId?: number; courses?: { id: number; title: string }[] }) {
  const { d } = useI18n();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await api<{ id: number }>("/api/activities", "POST", { course_id: Number(courseId ?? f.get("course_id")), title: f.get("title") });
        router.push(`/activities/${r.id}`);
      }}
    >
      {!courseId && courses && (
        <select name="course_id" required className="field !w-auto" defaultValue="">
          <option value="" disabled>{d.choose_course}</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      )}
      <input name="title" required maxLength={200} placeholder={d.activity_name} className="field !w-auto flex-1 min-w-48" />
      <button className="btn btn-primary">{d.new_activity}</button>
    </form>
  );
}
