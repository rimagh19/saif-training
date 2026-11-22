"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import {
  BarChart3, Check, ChevronLeft, Timer, ChevronRight, Copy, Eye, Lock, MonitorPlay, Play, RotateCcw, Square, Unlock, UserMinus, Users, Wifi, WifiOff, X,
} from "lucide-react";
import { useI18n } from "./i18n";
import { api, ApiError } from "./api";
import { useCountdown, useLiveResource } from "./live-hooks";
import { QR, useOrigin } from "./qr";
import { optionText, typeLabel } from "./question-editor";
import { ActivityStatus, Bar } from "./ui";
import type { TrainerLiveState } from "@/lib/live";
import type { Dict } from "@/lib/i18n";

export const stateLabel = (d: Dict, s: string) => ({ idle: d.q_idle, open: d.q_open, closed: d.q_closed, revealed: d.q_revealed })[s] ?? s;
export const stateClass = (s: string) =>
  ({ idle: "bg-silver/40 text-navy", open: "bg-forest text-white", closed: "bg-bronze text-white", revealed: "bg-gold text-white" })[s] ?? "";

export function LiveControl({ activityId }: { activityId: number }) {
  const { d, err } = useI18n();
  const origin = useOrigin();
  const { data: s, connected, reload, serverOffset } = useLiveResource<TrainerLiveState>(`/api/activities/${activityId}/live`, `/api/activities/${activityId}/stream`);
  const left = useCountdown(s?.activity.q_state === "open" ? s.activity.q_deadline : null, serverOffset, reload);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/activities/${activityId}/control`, "POST", { action, ...extra });
      await reload();
    } catch (x) {
      setMsg(err(x instanceof ApiError ? x.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <div className="card p-10 text-center text-platinum">{d.loading}</div>;
  const a = s.activity;
  const live = a.status === "live";
  const joinUrl = `${origin}/play/${a.join_code}`;
  const q = s.current;
  const answeredCount = s.answers.length;
  const total = s.participants.length;
  const isLast = s.current_index === s.questions.length - 1;

  return (
    <div className="space-y-5">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <ActivityStatus status={a.status} d={d} />
        {s.run && <span className="badge bg-sand text-navy">{d.run_n}{s.run.number}</span>}
        <span className={`badge ${connected ? "text-forest" : "text-bronze"}`}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{!connected && d.reconnecting}</span>
        <div className="ms-auto flex flex-wrap gap-2">
          <a href={`/present/${activityId}`} target="_blank" rel="noreferrer" className="btn btn-dark"><MonitorPlay size={17} /> {d.present_screen}</a>
          {s.run && <Link href={`/reports/activity/${activityId}?run=${s.run.id}`} className="btn btn-outline"><BarChart3 size={17} /> {d.report}</Link>}
          {live ? (
            <>
              <button className="btn btn-outline" disabled={busy} onClick={() => confirm(d.restart_confirm) && act("restart")}><RotateCcw size={17} /> {d.restart}</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => confirm(d.end_confirm) && act("end")}><Square size={16} /> {d.end_activity}</button>
            </>
          ) : (
            s.run && <button className="btn btn-outline" disabled={busy} onClick={() => confirm(d.restart_confirm) && act("restart")}><RotateCcw size={17} /> {d.restart}</button>
          )}
        </div>
      </div>
      {msg && <p role="alert" className="card p-3 text-bronze font-bold">{msg}</p>}

      {!live ? (
        <div className="card p-10 text-center">
          <div className="mx-auto mb-4 h-1 w-12 gold-sheen rounded" />
          <p className="text-platinum mb-6">{a.status === "ended" ? d.ended_msg : d.not_started}</p>
          {a.status !== "ended" && (
            <button className="btn btn-primary text-lg px-8 py-3" disabled={busy || s.questions.length === 0} onClick={() => act("start")}>
              <Play size={20} /> {d.start}
            </button>
          )}
          {s.questions.length === 0 && <p className="mt-3 text-bronze">{d.no_questions}</p>}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_18rem] 2xl:grid-cols-[15rem_1fr_19rem] gap-5">
          {/* navigator */}
          <aside className="card p-3 h-fit 2xl:sticky 2xl:top-4 order-3 2xl:order-1">
            <h3 className="px-2 pb-2 text-sm text-platinum font-bold">{d.questions}</h3>
            <ol className="space-y-1 max-h-[60vh] overflow-y-auto">
              {s.questions.map((qq, i) => {
                const current = qq.id === q?.id;
                return (
                  <li key={qq.id}>
                    <button
                      disabled={busy || current}
                      onClick={() => act("goto", { questionId: qq.id })}
                      className={`w-full text-start flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${current ? "bg-navy text-white" : "hover:bg-sand"}`}
                    >
                      <span className={`w-6 h-6 shrink-0 grid place-items-center rounded-full text-xs num ${current ? "bg-gold text-white" : qq.asked ? "bg-forest/15 text-forest" : "bg-sand"}`}>
                        {qq.asked && !current ? <Check size={12} /> : i + 1}
                      </span>
                      <span className="truncate">{qq.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          {/* current question */}
          <section className="space-y-4 order-1 2xl:order-2 min-w-0">
            {q ? (
              <div className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="badge bg-navy text-gold-light num">{d.question_of} {s.current_index + 1} {d.of} {s.questions.length}</span>
                  <span className="badge bg-gold/15 text-bronze">{typeLabel(d, q.type)}</span>
                  <span className={`badge ${stateClass(a.q_state)}`}>{stateLabel(d, a.q_state)}</span>
                  <span className="ms-auto text-2xl font-bold num text-navy">
                    {a.q_state === "open" ? (left === null ? "∞" : `${left}s`) : ""}
                  </span>
                </div>
                {q.title && <h2 className="text-2xl">{q.title}</h2>}
                {q.body && <p className="mt-1 whitespace-pre-line text-navy/85">{q.body}</p>}
                {q.image && <img src={`/api/uploads/${q.image}`} alt="" className="mt-3 max-h-56 rounded-lg border border-silver" />}

                {/* controls */}
                <div className="flex flex-wrap gap-2 mt-5">
                  <button className="btn btn-outline" disabled={busy || s.current_index <= 0} onClick={() => act("prev")}><ChevronRight size={17} className="ltr:rotate-180" /> {d.prev_q}</button>
                  {a.q_state === "open" ? (
                    <button className="btn btn-dark" disabled={busy} onClick={() => act("close")}><Lock size={17} /> {d.close_answers}</button>
                  ) : (
                    <button className="btn btn-primary" disabled={busy} onClick={() => act("open")}><Unlock size={17} /> {d.open_answers}</button>
                  )}
                  {a.q_state === "open" && a.q_deadline && <button className="btn btn-outline" disabled={busy} onClick={() => act("extend", { seconds: 15 })}><Timer size={17} /> {d.extend_time}</button>}
                  {s.distribution.length > 0 && a.q_state !== "revealed" && (
                    <button className={`btn ${a.q_show_dist ? "btn-dark" : "btn-outline"}`} disabled={busy} onClick={() => act("show_dist", { value: !a.q_show_dist })}>
                      <BarChart3 size={17} /> {a.q_show_dist ? d.hide_distribution : d.show_distribution}
                    </button>
                  )}
                  <button className="btn btn-outline" disabled={busy || a.q_state === "revealed" || a.q_state === "idle"} onClick={() => act("reveal")}><Eye size={17} /> {d.show_correct}</button>
                  <button className="btn btn-outline ms-auto" disabled={busy || isLast} onClick={() => act("next")}>{d.next_q} <ChevronLeft size={17} className="ltr:rotate-180" /></button>
                </div>

                {/* progress */}
                <div className="mt-6">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-bold">{answeredCount} / {total} {d.answered}</span>
                    <span className="num text-platinum">{total ? Math.round((answeredCount / total) * 100) : 0}%</span>
                  </div>
                  <Bar value={total ? (answeredCount / total) * 100 : 0} />
                </div>

                {/* distribution */}
                {s.distribution.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm text-platinum font-bold mb-2">{d.distribution}{q.type === "order" ? ` (${d.steps} 1)` : ""}</h3>
                    <ul className="space-y-2">
                      {s.distribution.map((o) => {
                        const pctv = answeredCount ? (o.count / answeredCount) * 100 : 0;
                        const showCorrect = q.type !== "order" && o.correct;
                        return (
                          <li key={o.id}>
                            <div className="flex items-center justify-between text-sm">
                              <span className={`flex items-center gap-1.5 ${showCorrect ? "text-forest font-bold" : ""}`}>{showCorrect && <Check size={14} />}{optionText(d, q.type, o)}</span>
                              <span className="num font-bold">{o.count}</span>
                            </div>
                            <Bar value={pctv} tone={showCorrect ? "forest" : "gold"} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {s.distribution.length === 0 && answeredCount > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2 text-sm">
                    <span className="badge bg-forest/10 text-forest">{d.correct}: {s.outcome.correct}</span>
                    <span className="badge bg-bronze/10 text-bronze">{d.wrong}: {s.outcome.wrong}</span>
                    {s.outcome.pending > 0 && <span className="badge bg-gold/15 text-bronze">{d.pending}: {s.outcome.pending}</span>}
                  </div>
                )}
                {q.explanation && (
                  <div className="mt-5 rounded-lg bg-sand p-3 text-sm"><b>{d.explanation}: </b>{q.explanation}</div>
                )}
              </div>
            ) : (
              <div className="card p-8 text-center text-platinum">{d.no_questions}</div>
            )}

            {/* answers */}
            {q && (
              <div className="card p-5">
                <h3 className="text-lg mb-3">{d.live_answers}</h3>
                {s.answers.length === 0 ? (
                  <p className="text-platinum text-sm">{d.none_yet}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table text-sm">
                      <tbody>
                        {s.answers.map((r) => (
                          <tr key={r.id} className="animate-fade-up">
                            <td className="font-bold whitespace-nowrap">{r.name}{r.trainee_number && <span className="text-platinum font-normal"> · {r.trainee_number}</span>}</td>
                            <td className="min-w-40">{r.text}</td>
                            <td className="whitespace-nowrap">
                              {r.is_correct === 1 ? <span className="badge bg-forest/10 text-forest">{d.correct}</span> : r.is_correct === 0 ? <span className="badge bg-bronze/10 text-bronze">{d.wrong}</span> : <span className="badge bg-gold/15 text-bronze">{d.pending}</span>}
                            </td>
                            <td className="whitespace-nowrap text-end">
                              <button title={d.mark_right} className="btn btn-ghost !p-1" onClick={async () => { await api(`/api/answers/${r.id}`, "PATCH", { correct: true }); reload(); }}><Check size={16} /></button>
                              <button title={d.mark_wrong} className="btn btn-ghost !p-1" onClick={async () => { await api(`/api/answers/${r.id}`, "PATCH", { correct: false }); reload(); }}><X size={16} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* join + participants */}
          <aside className="space-y-4 order-2 2xl:order-3 lg:row-span-2 2xl:row-span-1">
            <div className="card p-5 bg-navy text-white border-navy text-center">
              <div className="text-sm text-silver">{d.join_code}</div>
              <div className="text-4xl font-bold tracking-[0.25em] gold-text num" dir="ltr">{a.join_code}</div>
              {origin && <QR text={joinUrl} size={168} className="mx-auto mt-3 rounded-lg overflow-hidden bg-white p-1" />}
              <button
                className="mt-3 btn btn-ghost !text-silver hover:!bg-white/10 text-sm w-full"
                onClick={async () => {
                  await navigator.clipboard?.writeText(joinUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <Copy size={15} /> <span dir="ltr" className="truncate">{copied ? d.copied : joinUrl.replace(/^https?:\/\//, "")}</span>
              </button>
            </div>

            {s.leaderboard.length > 0 && (
              <div className="card p-5">
                <h3 className="text-lg mb-2">{d.leaderboard}</h3>
                <ol className="space-y-1 text-sm">
                  {s.leaderboard.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <span className={`w-6 h-6 grid place-items-center rounded-full text-xs num ${i < 3 ? "bg-gold text-white" : "bg-sand"}`}>{i + 1}</span>
                      <span className="truncate flex-1">{p.name}</span>
                      <b className="num">{p.score}</b>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="card p-5">
              <h3 className="text-lg mb-2 flex items-center gap-2"><Users size={18} /> {d.participants} <span className="num text-platinum">({total})</span></h3>
              {total === 0 ? (
                <p className="text-sm text-platinum">{d.waiting_participants}</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto divide-y divide-silver/40 text-sm">
                  {s.participants.map((p) => {
                    const did = s.answers.some((x) => x.participant_id === p.id);
                    return (
                      <li key={p.id} className="py-1.5 flex items-center gap-2 group">
                        <span className={`h-2 w-2 rounded-full ${did ? "bg-forest" : "bg-silver"}`} />
                        <span className="truncate flex-1">{p.display_name}{p.trainee_number && <span className="text-platinum"> · {p.trainee_number}</span>}</span>
                        <button
                          title={d.remove}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-platinum hover:text-bronze"
                          onClick={async () => {
                            if (!confirm(d.confirm_delete)) return;
                            await api(`/api/activities/${activityId}/participants/${p.id}`, "DELETE");
                            reload();
                          }}
                        >
                          <UserMinus size={15} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
