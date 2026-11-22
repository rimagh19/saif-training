"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";
import { useI18n } from "./i18n";

type C = { id?: number; title: string; description: string; trainer_name: string; course_date: string | null; mode: string; status: string };

export function CourseForm({ initial }: { initial: C }) {
  const { d, err } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="card p-6 space-y-5 max-w-3xl"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        setBusy(true);
        setError("");
        try {
          if (initial.id) {
            await api(`/api/courses/${initial.id}`, "PATCH", f);
            router.push(`/courses/${initial.id}`);
          } else {
            const r = await api<{ id: number }>("/api/courses", "POST", f);
            router.push(`/courses/${r.id}`);
          }
          router.refresh();
        } catch (x) {
          setError(err(x instanceof ApiError ? x.code : undefined));
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="title">{d.course_name}</label>
        <input id="title" name="title" required maxLength={200} defaultValue={initial.title} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="description">{d.course_desc}</label>
        <textarea id="description" name="description" rows={3} defaultValue={initial.description} className="field" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="trainer_name">{d.trainer_name}</label>
          <input id="trainer_name" name="trainer_name" defaultValue={initial.trainer_name} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="course_date">{d.course_date}</label>
          <input id="course_date" name="course_date" type="date" defaultValue={initial.course_date ?? ""} className="field" />
        </div>
        <div>
          <span className="label">{d.training_mode}</span>
          <div className="flex gap-2">
            {(["onsite", "remote"] as const).map((m) => (
              <label key={m} className="flex-1 cursor-pointer">
                <input type="radio" name="mode" value={m} defaultChecked={initial.mode === m} className="peer sr-only" />
                <span className="block text-center rounded-lg border border-silver py-2 font-bold peer-checked:border-gold peer-checked:bg-gold/10 peer-checked:text-bronze">
                  {m === "onsite" ? d.mode_onsite : d.mode_remote}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="status">{d.status}</label>
          <select id="status" name="status" defaultValue={initial.status} className="field">
            <option value="draft">{d.st_draft}</option>
            <option value="active">{d.st_active}</option>
            <option value="completed">{d.st_completed}</option>
            <option value="archived">{d.st_archived}</option>
          </select>
        </div>
      </div>
      {error && <p className="text-bronze font-bold">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>{initial.id ? d.save : d.create}</button>
        <button type="button" className="btn btn-outline" onClick={() => router.back()}>{d.cancel}</button>
      </div>
    </form>
  );
}
