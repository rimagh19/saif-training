"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useI18n } from "./i18n";
import { api, ApiError } from "./api";
import { QUESTION_TYPES, TF_OPTIONS, type Option, type Question, type QuestionType } from "@/lib/questions";
import type { Dict } from "@/lib/i18n";

const uid = () => Math.random().toString(36).slice(2, 9);

export function blankQuestion(type: QuestionType = "mcq"): Omit<Question, "id" | "activity_id" | "position"> {
  const o = [{ id: uid(), text: "" }, { id: uid(), text: "" }, { id: uid(), text: "" }];
  return { type, title: "", body: "", image: null, options: type === "tf" ? TF_OPTIONS : o, correct: [], explanation: "", points: 1, time_limit: 30, difficulty: "easy" };
}

export const optionText = (d: Dict, type: string, o: Option) => (type === "tf" ? (o.id === "true" ? d.tf_true : d.tf_false) : o.text);

export const typeLabel = (d: Dict, t: string) => d[`t_${t}` as keyof Dict] ?? t;

type Draft = Omit<Question, "id" | "activity_id" | "position"> & { id?: number };

export function QuestionEditor({
  activityId,
  initial,
  onDone,
  save: customSave,
  heading,
  children,
  plain = false,
}: {
  activityId?: number;
  initial: Draft;
  onDone: (saved: boolean) => void;
  /** Custom persistence (e.g. the question bank). Receives the validated-shape payload. */
  save?: (payload: Record<string, unknown>) => Promise<unknown>;
  heading?: string;
  /** Extra fields rendered above the save buttons (e.g. classification). */
  children?: React.ReactNode;
  plain?: boolean;
}) {
  const { d, err } = useI18n();
  const [q, setQ] = useState<Draft>(initial);
  const [shortAnswers, setShortAnswers] = useState(initial.type === "short" ? initial.correct.join("\n") : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Draft>) => setQ((p) => ({ ...p, ...patch }));
  const setType = (type: QuestionType) => {
    if (type === q.type) return;
    let options: Option[] = q.type === "tf" ? [{ id: uid(), text: "" }, { id: uid(), text: "" }, { id: uid(), text: "" }] : q.options;
    if (type === "tf") options = TF_OPTIONS;
    let correct: string[] = [];
    if (type !== "short" && q.type !== "tf" && q.type !== "short") {
      correct = type === "multi" ? q.correct : q.correct.slice(0, 1);
    }
    setQ((p) => ({ ...p, type, options, correct }));
  };
  const setOption = (id: string, text: string) => set({ options: q.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  const removeOption = (id: string) => set({ options: q.options.filter((o) => o.id !== id), correct: q.correct.filter((c) => c !== id) });
  const moveOption = (i: number, dir: -1 | 1) => {
    const o = [...q.options];
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    set({ options: o });
  };
  const toggleCorrect = (id: string) => {
    if (q.type === "multi") set({ correct: q.correct.includes(id) ? q.correct.filter((c) => c !== id) : [...q.correct, id] });
    else set({ correct: [id] });
  };

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) set({ image: data.name });
    else setError(err(data.error));
  }

  async function save() {
    setBusy(true);
    setError("");
    const payload = {
      ...q,
      activity_id: activityId,
      options: q.type === "short" ? [] : q.options.filter((o) => o.text.trim()),
      correct: q.type === "short" ? shortAnswers.split("\n").map((s) => s.trim()).filter(Boolean) : q.correct,
    };
    try {
      if (customSave) await customSave(payload);
      else if (q.id) await api(`/api/questions/${q.id}`, "PATCH", payload);
      else await api("/api/questions", "POST", payload);
      onDone(true);
    } catch (x) {
      setError(err(x instanceof ApiError ? x.code : undefined));
      setBusy(false);
    }
  }

  const hasOptions = q.type !== "short";
  const isOrder = q.type === "order";

  return (
    <div className={plain ? "card p-5 sm:p-6" : "card p-5 sm:p-6 border-gold/60 shadow-sm animate-pop"}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl">{heading ?? (q.id ? d.edit_question : d.add_question)}</h3>
        <button className="btn btn-ghost !p-1.5" onClick={() => onDone(false)} aria-label={d.close}><X size={20} /></button>
      </div>

      <span className="label">{d.q_type}</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
        {QUESTION_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-lg border px-2 py-2 text-sm font-bold transition-colors ${q.type === t ? "border-gold bg-gold/10 text-bronze" : "border-silver hover:border-gold"}`}
          >
            {typeLabel(d, t)}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        <div>
          <label className="label" htmlFor="q-title">{d.q_title}</label>
          <input id="q-title" className="field" value={q.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="q-body">{q.type === "scenario" ? d.q_body_scenario : d.q_body}</label>
          <textarea id="q-body" className="field" rows={q.type === "scenario" ? 5 : 3} value={q.body} onChange={(e) => set({ body: e.target.value })} />
        </div>

        <div>
          <span className="label">{d.q_image}</span>
          {q.image ? (
            <div className="flex items-start gap-3">
              <img src={`/api/uploads/${q.image}`} alt="" className="h-28 rounded-lg border border-silver object-cover" />
              <button type="button" className="btn btn-danger text-sm" onClick={() => set({ image: null })}><Trash2 size={15} /> {d.remove_image}</button>
            </div>
          ) : (
            <>
              <button type="button" className="btn btn-outline text-sm" onClick={() => fileRef.current?.click()}><ImagePlus size={16} /> {d.upload_image}</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </>
          )}
        </div>

        {hasOptions && (
          <div>
            <span className="label">{isOrder ? d.steps : d.options}</span>
            {isOrder && <p className="text-sm text-platinum mb-2">{d.order_hint}</p>}
            <ul className="space-y-2">
              {q.options.map((o, i) => {
                const isCorrect = q.correct.includes(o.id);
                return (
                  <li key={o.id} className="flex items-center gap-2">
                    {isOrder ? (
                      <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full bg-navy text-white text-sm num">{i + 1}</span>
                    ) : (
                      <button
                        type="button"
                        title={d.mark_correct}
                        onClick={() => toggleCorrect(o.id)}
                        className={`w-8 h-8 shrink-0 grid place-items-center border-2 transition-colors ${q.type === "multi" ? "rounded-md" : "rounded-full"} ${
                          isCorrect ? "bg-forest border-forest text-white" : "border-silver text-transparent hover:border-forest"
                        }`}
                      >
                        <Check size={16} />
                      </button>
                    )}
                    <input
                      className="field"
                      value={q.type === "tf" ? optionText(d, q.type, o) : o.text}
                      disabled={q.type === "tf"}
                      placeholder={`${isOrder ? "" : d.option} ${i + 1}`}
                      onChange={(e) => setOption(o.id, e.target.value)}
                    />
                    {q.type !== "tf" && (
                      <div className="flex shrink-0">
                        {isOrder && (
                          <>
                            <button type="button" className="btn btn-ghost !p-1.5" onClick={() => moveOption(i, -1)} aria-label={d.move_up}><ArrowUp size={16} /></button>
                            <button type="button" className="btn btn-ghost !p-1.5" onClick={() => moveOption(i, 1)} aria-label={d.move_down}><ArrowDown size={16} /></button>
                          </>
                        )}
                        <button type="button" className="btn btn-ghost !p-1.5" disabled={q.options.length <= 2} onClick={() => removeOption(o.id)} aria-label={d.delete}><Trash2 size={16} /></button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {q.type !== "tf" && q.options.length < 12 && (
              <button type="button" className="btn btn-ghost text-sm mt-2" onClick={() => set({ options: [...q.options, { id: uid(), text: "" }] })}>
                <Plus size={16} /> {isOrder ? d.add_step : d.add_option}
              </button>
            )}
          </div>
        )}

        {q.type === "short" && (
          <div>
            <label className="label" htmlFor="q-short">{d.accepted_answers}</label>
            <textarea id="q-short" className="field" rows={3} value={shortAnswers} onChange={(e) => setShortAnswers(e.target.value)} />
            <p className="text-sm text-platinum mt-1">{d.accepted_hint}</p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="q-exp">{d.explanation}</label>
          <textarea id="q-exp" className="field" rows={2} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="label" htmlFor="q-points">{d.q_points}</label>
            <input id="q-points" type="number" min={0} max={1000} className="field num" value={q.points} onChange={(e) => set({ points: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="q-time">{d.q_time}</label>
            <input id="q-time" type="number" min={0} max={3600} step={5} className="field num" value={q.time_limit} onChange={(e) => set({ time_limit: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="q-diff">{d.difficulty}</label>
            <select id="q-diff" className="field" value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value as Draft["difficulty"] })}>
              <option value="easy">{d.d_easy}</option>
              <option value="medium">{d.d_medium}</option>
              <option value="advanced">{d.d_advanced}</option>
            </select>
          </div>
        </div>
      </div>

      {children && <div className="mt-5 pt-5 border-t border-silver/50">{children}</div>}
      {error && <p role="alert" className="text-bronze font-bold mt-4">{error}</p>}
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{d.save}</button>
        <button className="btn btn-outline" onClick={() => onDone(false)}>{d.cancel}</button>
      </div>
    </div>
  );
}
