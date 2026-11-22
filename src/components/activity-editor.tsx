"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, BookmarkPlus, Check, Clock, Library, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "./i18n";
import { api } from "./api";
import { blankQuestion, optionText, QuestionEditor, typeLabel } from "./question-editor";
import { BankPicker, SaveToBankDialog } from "./bank-picker";
import type { Suggestions } from "./bank-fields";
import type { Question } from "@/lib/questions";
import type { Activity } from "@/lib/repo";

type Props = {
  activity: Activity & { course_title: string };
  questions: Question[];
  bankVersions: Record<number, { version: number; status: string }>;
  suggestions: Suggestions;
};

export function ActivityEditor({ activity, questions, bankVersions, suggestions }: Props) {
  const { d } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [title, setTitle] = useState(activity.title);
  const [desc, setDesc] = useState(activity.description);
  const [savedMsg, setSavedMsg] = useState(false);
  const [picking, setPicking] = useState(false);
  const [savingToBank, setSavingToBank] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bankDefaults = { domain: "", specialty: "", topic: activity.title, tags: [] as string[] };
  const unlinked = questions.filter((q) => !q.bank_id || !bankVersions[q.bank_id]);

  const patch = async (body: Record<string, unknown>) => {
    await api(`/api/activities/${activity.id}`, "PATCH", body);
    router.refresh();
  };
  const move = async (i: number, dir: -1 | 1) => {
    const ids = questions.map((q) => q.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api(`/api/activities/${activity.id}/reorder`, "POST", { ids });
    router.refresh();
  };
  const done = (saved: boolean) => {
    setEditing(null);
    if (saved) router.refresh();
  };

  return (
    <div className="grid xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl">{d.questions} <span className="text-platinum num text-lg">({questions.length})</span></h2>
          {editing === null && (
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-outline" onClick={() => setPicking(true)}><Library size={18} /> {d.import_from_library}</button>
              <button className="btn btn-primary" onClick={() => setEditing("new")}><Plus size={18} /> {d.add_question}</button>
            </div>
          )}
        </div>

        {editing === "new" && <QuestionEditor activityId={activity.id} initial={blankQuestion()} onDone={done} />}

        {questions.length === 0 && editing !== "new" && (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-3 h-1 w-10 gold-sheen rounded" />
            <p className="text-platinum">{d.no_questions}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button className="btn btn-primary" onClick={() => setEditing("new")}><Plus size={18} /> {d.add_question}</button>
              <button className="btn btn-outline" onClick={() => setPicking(true)}><Library size={18} /> {d.import_from_library}</button>
            </div>
          </div>
        )}

        <ol className="space-y-3">
          {questions.map((q, i) =>
            editing === q.id ? (
              <li key={q.id}><QuestionEditor activityId={activity.id} initial={q} onDone={done} /></li>
            ) : (
              <li key={q.id} className="card p-4 sm:p-5 group">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-9 h-9 grid place-items-center rounded-full bg-navy text-gold-light font-bold num">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                      <span className="badge bg-gold/15 text-bronze">{typeLabel(d, q.type)}</span>
                      <span className="badge bg-sand text-navy">{d[`d_${q.difficulty}` as const]}</span>
                      <span className="badge bg-sand text-navy num">{q.points} {d.points}</span>
                      <span className="badge bg-sand text-navy num"><Clock size={12} /> {q.time_limit ? `${q.time_limit} ${d.seconds}` : "∞"}</span>
                      {q.bank_id && bankVersions[q.bank_id] && (
                        <Link href={`/library/${q.bank_id}`} title={d.library_link_note} className="badge bg-navy/5 text-navy hover:bg-navy/10">
                          <Library size={12} /> {d.from_library} <span dir="ltr" className="num">v{q.bank_version}</span>
                        </Link>
                      )}
                      {q.bank_id && bankVersions[q.bank_id] && bankVersions[q.bank_id].version > (q.bank_version ?? 0) && (
                        <button
                          className="badge bg-gold text-white hover:bg-bronze"
                          title={d.update_from_library}
                          onClick={async () => {
                            await api(`/api/questions/${q.id}/sync`, "POST");
                            router.refresh();
                          }}
                        >
                          <RefreshCw size={12} /> {d.update_available} <span dir="ltr" className="num">v{bankVersions[q.bank_id].version}</span>
                        </button>
                      )}
                    </div>
                    {q.title && <h3 className="text-lg">{q.title}</h3>}
                    {q.body && <p className="text-navy/80 whitespace-pre-line line-clamp-4">{q.body}</p>}
                    {q.image && <img src={`/api/uploads/${q.image}`} alt="" className="mt-2 h-24 rounded-lg border border-silver object-cover" />}
                    {q.type === "short" ? (
                      <p className="mt-2 text-sm"><span className="text-platinum">{d.correct_answer}:</span> <b className="text-forest">{q.correct.join(" / ") || "—"}</b></p>
                    ) : (
                      <ul className={`mt-2 grid gap-1.5 ${q.type === "order" ? "" : "sm:grid-cols-2"}`}>
                        {q.options.map((o, k) => {
                          const ok = q.type !== "order" && q.correct.includes(o.id);
                          return (
                            <li key={o.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm border ${ok ? "border-forest/40 bg-forest/5 text-forest font-bold" : "border-silver/60"}`}>
                              {q.type === "order" ? <span className="num text-platinum">{k + 1}.</span> : ok ? <Check size={14} /> : <span className="w-3.5" />}
                              {optionText(d, q.type, o)}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-0.5 shrink-0">
                    <button className="btn btn-ghost !p-1.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label={d.move_up}><ArrowUp size={17} /></button>
                    <button className="btn btn-ghost !p-1.5" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label={d.move_down}><ArrowDown size={17} /></button>
                    {(!q.bank_id || !bankVersions[q.bank_id]) && (
                      <button className="btn btn-ghost !p-1.5" title={d.save_to_library} onClick={() => setSavingToBank(q.id)} aria-label={d.save_to_library}><BookmarkPlus size={17} /></button>
                    )}
                    <button className="btn btn-ghost !p-1.5" onClick={() => setEditing(q.id)} aria-label={d.edit}><Pencil size={17} /></button>
                    <button
                      className="btn btn-ghost !p-1.5"
                      aria-label={d.delete}
                      onClick={async () => {
                        if (!confirm(d.confirm_delete)) return;
                        await api(`/api/questions/${q.id}`, "DELETE");
                        router.refresh();
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              </li>
            )
          )}
        </ol>
      </div>

      <aside className="space-y-4">
        <div className="card p-5 bg-navy text-white border-navy">
          <div className="text-sm text-silver">{d.join_code}</div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-4xl font-bold tracking-[0.25em] gold-text num" dir="ltr">{activity.join_code}</div>
            <button
              className="btn btn-ghost !text-silver hover:!bg-white/10 text-sm"
              disabled={activity.status === "live"}
              onClick={() => patch({ regenerate_code: true })}
            >
              <RefreshCw size={15} /> {d.new_code}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Link href={`/activities/${activity.id}/live`} className={`btn btn-primary ${questions.length === 0 ? "pointer-events-none opacity-50" : ""}`}><Play size={17} /> {d.run_activity}</Link>
            <Link href={`/reports/activity/${activity.id}`} className="btn btn-outline !bg-transparent !text-white !border-white/30 hover:!border-gold"><BarChart3 size={17} /> {d.report}</Link>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="text-lg">{d.activity_settings}</h3>
          <div>
            <label className="label" htmlFor="a-title">{d.activity_name}</label>
            <input id="a-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="a-desc">{d.activity_desc}</label>
            <textarea id="a-desc" className="field" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <button
            className="btn btn-outline text-sm"
            onClick={async () => {
              await patch({ title, description: desc });
              setSavedMsg(true);
              setTimeout(() => setSavedMsg(false), 1500);
            }}
          >
            {savedMsg ? <><Check size={15} /> {d.saved}</> : d.save}
          </button>
          {unlinked.length > 0 && (
            <button
              className="btn btn-outline w-full text-sm"
              disabled={bulkSaving}
              onClick={async () => {
                setBulkSaving(true);
                for (const q of unlinked) await api(`/api/questions/${q.id}/bank`, "POST", bankDefaults).catch(() => {});
                setBulkSaving(false);
                router.refresh();
              }}
            >
              <BookmarkPlus size={15} /> {d.save_all_to_library} <span className="num">({unlinked.length})</span>
            </button>
          )}
          <hr className="border-silver/50" />
          <div>
            <label className="label" htmlFor="a-id">{d.identity_mode}</label>
            <select id="a-id" className="field" value={activity.identity_mode} onChange={(e) => patch({ identity_mode: e.target.value })}>
              <option value="name_id">{d.identity_name_id}</option>
              <option value="name">{d.identity_name}</option>
            </select>
          </div>
          <Toggle label={d.reveal_to_trainees} checked={!!activity.reveal_to_trainees} onChange={(v) => patch({ reveal_to_trainees: v })} />
          <Toggle label={d.allow_change} checked={!!activity.allow_change} onChange={(v) => patch({ allow_change: v })} />
          <Toggle label={d.allow_late_edit} checked={!!activity.allow_late_edit} onChange={(v) => patch({ allow_late_edit: v })} />
          <Toggle label={d.show_leaderboard} checked={!!activity.show_leaderboard} onChange={(v) => patch({ show_leaderboard: v })} />
          <hr className="border-silver/50" />
          <button
            className="btn btn-danger w-full text-sm"
            onClick={async () => {
              if (!confirm(d.confirm_delete)) return;
              await api(`/api/activities/${activity.id}`, "DELETE");
              router.push(`/courses/${activity.course_id}`);
              router.refresh();
            }}
          >
            <Trash2 size={15} /> {d.delete}
          </button>
        </div>
      </aside>
      {picking && (
        <BankPicker
          activityId={activity.id}
          suggestions={suggestions}
          onClose={() => setPicking(false)}
          onDone={() => {
            setPicking(false);
            router.refresh();
          }}
        />
      )}
      {savingToBank !== null && (
        <SaveToBankDialog
          questionId={savingToBank}
          defaults={bankDefaults}
          suggestions={suggestions}
          onClose={() => setSavingToBank(null)}
          onDone={() => {
            setSavingToBank(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 h-6 w-11 rounded-full transition-colors ${checked ? "bg-gold" : "bg-silver"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "start-[1.375rem]" : "start-0.5"}`} />
      </button>
    </label>
  );
}
