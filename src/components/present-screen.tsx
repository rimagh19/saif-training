"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3, Check, ChevronLeft, ChevronRight, Eye, Lock, Maximize, Minimize, Play, QrCode, RotateCcw, Square, Timer, Trophy, Unlock, Users, X,
} from "lucide-react";
import { useI18n } from "./i18n";
import { api, ApiError } from "./api";
import { useCountdown, useLiveResource } from "./live-hooks";
import { QR, useOrigin } from "./qr";
import { Logo } from "./logo";
import type { PresenterState } from "@/lib/live";
import type { Dict } from "@/lib/i18n";

const LETTERS = { ar: ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل"], en: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] };
// Card accents drawn only from the SAFE palette
const ACCENTS = ["#bc9a5f", "#cdb589", "#f2ebdf", "#bfbfbf", "#644f29", "#767779"];

type Phase = "ready" | "open" | "closed" | "revealed";

/**
 * Presenter Mode — the screen shown on the projector or shared in a remote session.
 * Its data comes from /api/activities/:id/present, which never contains the correct
 * answer before the trainer reveals it. The trainer drives every phase of the question
 * from the on-screen control bar or the keyboard.
 */
export function PresentScreen({ activityId }: { activityId: number }) {
  const { d, lang, err } = useI18n();
  const origin = useOrigin();
  const { data: s, reload, serverOffset, connected } = useLiveResource<PresenterState>(
    `/api/activities/${activityId}/present`,
    `/api/activities/${activityId}/stream`
  );
  const left = useCountdown(s?.activity.q_state === "open" ? s.activity.q_deadline : null, serverOffset, reload);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [fs, setFs] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = useRef(false);

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusy(true);
      try {
        await api(`/api/activities/${activityId}/control`, "POST", { action, ...extra });
        await reload();
      } catch (x) {
        setToast(err(x instanceof ApiError ? x.code : undefined));
        setTimeout(() => setToast(""), 3000);
      } finally {
        setBusy(false);
      }
    },
    [activityId, reload, err]
  );

  // control bar: visible on activity, fades when idle so the projected screen stays clean
  const poke = useCallback(() => {
    setBarVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => !hovering.current && setBarVisible(false), 4000);
  }, []);
  useEffect(() => {
    hideTimer.current = setTimeout(() => !hovering.current && setBarVisible(false), 4000);
    window.addEventListener("mousemove", poke);
    window.addEventListener("touchstart", poke);
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("touchstart", poke);
      document.removeEventListener("fullscreenchange", onFs);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [poke]);

  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

  const live = s?.activity.status === "live";
  const q = s?.question ?? null;
  const phase: Phase | null = live && q ? (s!.activity.q_state === "idle" ? "ready" : (s!.activity.q_state as Phase)) : null;
  const isLast = !!s && s.index === s.total - 1;
  const hasOptionDist = !!q && q.type !== "short" && q.type !== "order";

  const primary = useCallback(() => {
    if (!s) return;
    if (!live) return s.activity.status === "ended" ? confirm(d.restart_confirm) && act("restart") : act("start");
    if (phase === "ready") return act("open");
    if (phase === "open") return act("close");
    if (phase === "closed") return act("reveal");
    if (phase === "revealed") return isLast ? confirm(d.end_confirm) && act("end") : act("next");
  }, [s, live, phase, isLast, act, d]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!s || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      poke();
      const k = e.key.toLowerCase();
      const forward = lang === "ar" ? "arrowleft" : "arrowright";
      const backward = lang === "ar" ? "arrowright" : "arrowleft";
      if (k === " " || k === "enter") { e.preventDefault(); primary(); }
      else if (k === "f") toggleFs();
      else if (k === "q") setShowQr((v) => !v);
      else if (k === "escape") { setShowQr(false); setShowBoard(false); }
      else if (!live) return;
      else if (k === "r" && phase !== "revealed") act("reveal");
      else if (k === "d" && hasOptionDist && phase !== "revealed") act("show_dist");
      else if (k === forward && !isLast) act("next");
      else if (k === backward && s.index > 0) act("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, busy, lang, live, phase, isLast, hasOptionDist, act, primary, poke]);

  if (!s) return <div className="h-screen bg-navy" />;
  const a = s.activity;
  const joinUrl = `${origin}/play/${a.join_code}`;
  const letters = LETTERS[lang];
  const progress = s.participants ? Math.round((s.answered / s.participants) * 100) : 0;

  return (
    <div className="relative h-screen overflow-hidden bg-navy text-white flex flex-col select-none" onMouseMove={poke}>
      {/* ---------- header ---------- */}
      <header className="shrink-0 flex items-center gap-4 px-6 lg:px-10 py-3 border-b border-white/10">
        <Logo height={38} />
        <div className="leading-tight min-w-0">
          <div className="text-lg lg:text-xl font-bold truncate">{a.title}</div>
          <div className="text-silver text-sm truncate">{a.course_title}</div>
        </div>
        <div className="ms-auto flex items-center gap-3 lg:gap-5">
          {phase && <PhasePill phase={phase} d={d} />}
          <Stat icon={<Users size={20} />} value={s.participants} label={d.participants_joined} />
          {phase && phase !== "ready" && <Stat icon={<Check size={20} />} value={`${s.answered}/${s.participants}`} label={d.answers_sent} />}
          <button onClick={() => setShowQr(true)} className="hidden md:flex items-center gap-2 rounded-xl border border-gold/40 px-3 py-1.5 hover:bg-white/5" title={d.show_qr}>
            <QrCode size={18} className="text-gold" />
            <span className="text-2xl font-bold tracking-[0.18em] gold-text num" dir="ltr">{a.join_code}</span>
          </button>
          {!connected && <span className="text-xs text-gold-light">{d.reconnecting}</span>}
        </div>
      </header>

      {/* ---------- stage ---------- */}
      <main className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-14 pt-6 pb-32 flex flex-col">
        {!live || !q ? (
          <JoinStage s={s} d={d} joinUrl={joinUrl} origin={origin} />
        ) : (
          <div className="my-auto w-full mx-auto max-w-7xl animate-fade-up" key={q.id}>
            <div className="flex items-start gap-8">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
                  <span className="rounded-full bg-gold text-navy font-bold px-3 py-1 num">{d.question_of} {s.index + 1} {d.of} {s.total}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1">{d[`t_${q.type}` as keyof Dict]}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 num">{q.points} {d.points}</span>
                </div>
                {q.title && <h1 className={`font-bold leading-snug ${titleSize(q.title)}`}>{q.title}</h1>}
                {q.body && (
                  <p className={`mt-3 text-silver whitespace-pre-line leading-relaxed ${q.type === "scenario" ? "text-2xl rounded-2xl bg-white/5 border-s-4 border-gold p-5" : q.title ? "text-2xl" : titleSize(q.body)}`}>
                    {q.body}
                  </p>
                )}
              </div>
              <TimerRing phase={phase!} left={left} limit={q.time_limit} d={d} />
            </div>

            {q.image && <img src={`/api/uploads/${q.image}`} alt="" className="mt-5 max-h-[26vh] rounded-2xl border border-white/10" />}

            {/* options */}
            {q.type === "short" ? (
              <ShortPanel q={q} phase={phase!} d={d} />
            ) : (
              <ul className={`mt-8 grid gap-4 ${q.type === "order" ? "grid-cols-1 max-w-4xl" : q.options.length > 4 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>
                {q.options.map((o, i) => (
                  <OptionCard
                    key={o.id}
                    index={i}
                    letter={q.type === "order" && phase === "revealed" ? String(i + 1) : letters[i]}
                    text={q.type === "tf" ? (o.id === "true" ? d.tf_true : d.tf_false) : o.text}
                    count={o.count}
                    percent={o.percent}
                    correct={o.correct}
                    revealed={phase === "revealed"}
                    ordered={q.type === "order"}
                  />
                ))}
              </ul>
            )}

            {/* outcome after reveal for question types without option distribution */}
            {phase === "revealed" && s.outcome && !hasOptionDist && s.answered > 0 && (
              <div className="mt-6 max-w-4xl">
                <div className="flex items-center justify-between text-lg mb-1">
                  <span>{d.correct_rate}</span>
                  <span className="num font-bold text-gold-light">{Math.round((s.outcome.correct / s.answered) * 100)}% <span className="text-silver text-sm">({s.outcome.correct}/{s.answered})</span></span>
                </div>
                <div className="h-3 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gold transition-[width] duration-700" style={{ width: `${(s.outcome.correct / s.answered) * 100}%` }} /></div>
              </div>
            )}

            {q.explanation && (
              <div className="mt-6 max-w-5xl rounded-2xl bg-gold/10 border border-gold/30 p-5 text-xl animate-fade-up">
                <span className="text-gold-light font-bold">{d.explanation}: </span>
                {q.explanation}
              </div>
            )}

            {phase !== "revealed" && hasOptionDist && !a.q_show_dist && phase !== "ready" && (
              <p className="mt-6 text-silver/80 text-sm flex items-center gap-2"><Lock size={14} /> {d.hidden_until_reveal}</p>
            )}
          </div>
        )}
      </main>

      {/* ---------- answered progress strip ---------- */}
      {phase && phase !== "ready" && (
        <div className="absolute bottom-0 inset-x-0 h-1.5 bg-white/10">
          <div className="h-full gold-sheen transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}
      {!phase && <div className="absolute bottom-0 inset-x-0 h-1.5 gold-sheen" />}

      {/* ---------- control bar ---------- */}
      <div
        className={`no-print fixed bottom-5 inset-x-0 flex justify-center px-4 transition-all duration-300 ${barVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}
        onMouseEnter={() => (hovering.current = true)}
        onMouseLeave={() => { hovering.current = false; poke(); }}
      >
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-black/55 backdrop-blur border border-white/10 p-2 shadow-2xl">
          {!live ? (
            <>
              <CtrlButton primary disabled={busy || (a.status !== "ended" && s.total === 0)} onClick={primary} icon={a.status === "ended" ? <RotateCcw size={18} /> : <Play size={18} />}>
                {a.status === "ended" ? d.restart : d.start}
              </CtrlButton>
              {s.leaderboard.length > 0 && <CtrlButton onClick={() => setShowBoard(true)} icon={<Trophy size={18} />}>{d.leaderboard_btn}</CtrlButton>}
            </>
          ) : (
            <>
              <CtrlButton disabled={busy || s.index <= 0} onClick={() => act("prev")} icon={<ChevronRight size={18} className="ltr:rotate-180" />}>{d.prev_short}</CtrlButton>
              {phase === "ready" && <CtrlButton primary disabled={busy} onClick={() => act("open")} icon={<Play size={18} />}>{d.start_question}</CtrlButton>}
              {phase === "open" && <CtrlButton primary disabled={busy} onClick={() => act("close")} icon={<Lock size={18} />}>{d.close_answers}</CtrlButton>}
              {phase === "open" && a.q_deadline && <CtrlButton disabled={busy} onClick={() => act("extend", { seconds: 15 })} icon={<Timer size={18} />}>{d.extend_time}</CtrlButton>}
              {phase === "closed" && <CtrlButton disabled={busy} onClick={() => act("open")} icon={<Unlock size={18} />}>{d.restart_question}</CtrlButton>}
              {hasOptionDist && phase !== "revealed" && phase !== "ready" && (
                <CtrlButton disabled={busy} active={a.q_show_dist} onClick={() => act("show_dist", { value: !a.q_show_dist })} icon={<BarChart3 size={18} />}>
                  {a.q_show_dist ? d.hide_distribution : d.show_distribution}
                </CtrlButton>
              )}
              {phase !== "revealed" && (
                <CtrlButton primary={phase === "closed"} disabled={busy || phase === "ready"} onClick={() => act("reveal")} icon={<Eye size={18} />}>{d.show_correct}</CtrlButton>
              )}
              {s.leaderboard.length > 0 && phase === "revealed" && <CtrlButton onClick={() => setShowBoard(true)} icon={<Trophy size={18} />}>{d.leaderboard_btn}</CtrlButton>}
              {isLast ? (
                <CtrlButton primary={phase === "revealed"} disabled={busy} onClick={() => confirm(d.end_confirm) && act("end")} icon={<Square size={16} />}>{d.end_here}</CtrlButton>
              ) : (
                <CtrlButton primary={phase === "revealed"} disabled={busy} onClick={() => act("next")} icon={<ChevronLeft size={18} className="ltr:rotate-180" />}>{d.next_q}</CtrlButton>
              )}
            </>
          )}
          <span className="mx-1 h-8 w-px bg-white/15" />
          <IconButton title={d.show_qr} onClick={() => setShowQr(true)}><QrCode size={18} /></IconButton>
          <IconButton title="Fullscreen" onClick={toggleFs}>{fs ? <Minimize size={18} /> : <Maximize size={18} />}</IconButton>
        </div>
      </div>
      {barVisible && <div className="fixed bottom-1 inset-x-0 text-center text-[11px] text-silver/50 pointer-events-none hidden lg:block">{d.controls_hint}</div>}

      {toast && <div className="fixed top-20 inset-x-0 flex justify-center"><div className="rounded-xl bg-bronze px-4 py-2 font-bold animate-pop">{toast}</div></div>}

      {/* ---------- overlays ---------- */}
      {showQr && (
        <Overlay onClose={() => setShowQr(false)}>
          <div className="text-center">
            {origin && <QR text={joinUrl} size={340} className="mx-auto rounded-2xl overflow-hidden bg-white p-3" />}
            <div className="mt-5 text-2xl text-silver">{d.join_at}</div>
            <div className="text-3xl font-bold" dir="ltr">{joinUrl.replace(/^https?:\/\//, "")}</div>
            <div className="mt-3 text-7xl font-bold tracking-[0.2em] gold-text num" dir="ltr">{a.join_code}</div>
          </div>
        </Overlay>
      )}
      {showBoard && (
        <Overlay onClose={() => setShowBoard(false)}>
          <Leaderboard rows={s.leaderboard} title={d.leaderboard} />
        </Overlay>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const titleSize = (t: string) => (t.length < 70 ? "text-4xl lg:text-6xl" : t.length < 140 ? "text-3xl lg:text-5xl" : "text-2xl lg:text-4xl");

function PhasePill({ phase, d }: { phase: Phase; d: Dict }) {
  const map = {
    ready: { label: d.phase_ready, cls: "bg-white/10 text-white" },
    open: { label: d.phase_open, cls: "bg-forest text-white" },
    closed: { label: d.phase_closed, cls: "bg-bronze text-white" },
    revealed: { label: d.phase_revealed, cls: "bg-gold text-navy" },
  }[phase];
  return (
    <span className={`hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-bold ${map.cls}`}>
      {phase === "open" && <span className="h-2.5 w-2.5 rounded-full bg-gold-light animate-pulse" />}
      {map.label}
    </span>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <span className="text-gold">{icon}</span>
      <span className="text-2xl lg:text-3xl font-bold num" dir="ltr">{value}</span>
      <span className="hidden xl:inline text-sm text-silver">{label}</span>
    </div>
  );
}

function TimerRing({ phase, left, limit, d }: { phase: Phase; left: number | null; limit: number; d: Dict }) {
  const size = 150;
  const r = 64;
  const c = 2 * Math.PI * r;
  const total = Math.max(limit, left ?? 0) || 1;
  const timed = phase === "open" && left !== null;
  const frac = timed ? left! / total : phase === "ready" && limit ? 1 : 0;
  const low = timed && left! <= 5;
  const label = phase === "open" ? (left === null ? "∞" : left === 0 ? "0" : String(left)) : phase === "ready" ? (limit ? String(limit) : "∞") : "";
  return (
    <div className="shrink-0 relative" style={{ width: size, height: size }} aria-label={d.time_left}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={low ? "#644f29" : "#bc9a5f"}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {phase === "closed" || phase === "revealed" || (timed && left === 0) ? (
          <div className="flex flex-col items-center text-gold-light">
            <Lock size={30} />
            <span className="text-sm mt-1">{timed && left === 0 ? d.time_up : d.phase_closed}</span>
          </div>
        ) : (
          <div>
            <div className={`text-5xl font-bold num ${low ? "text-gold-light animate-pulse" : ""}`}>{label}</div>
            {phase === "ready" && <div className="text-xs text-silver">{limit ? d.seconds : d.no_time_limit}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function OptionCard({ index, letter, text, count, percent, correct, revealed, ordered }: {
  index: number; letter: string; text: string; count: number | null; percent: number | null; correct: boolean | null; revealed: boolean; ordered: boolean;
}) {
  const accent = ACCENTS[index % ACCENTS.length];
  const isCorrect = correct === true;
  const dim = revealed && correct === false;
  const showPct = percent !== null;
  return (
    <li
      className={`relative overflow-hidden rounded-2xl border-2 transition-all duration-500 animate-fade-up ${
        isCorrect ? "border-gold bg-gold/15 shadow-[0_0_40px_-10px_rgba(188,154,95,0.7)]" : "border-white/10 bg-white/[0.04]"
      } ${dim ? "opacity-40" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span className="absolute inset-y-0 start-0 w-1.5" style={{ background: accent }} />
      {showPct && (
        <span
          className={`absolute inset-y-0 start-0 transition-[width] duration-700 ease-out ${isCorrect ? "bg-gold/25" : "bg-white/[0.07]"}`}
          style={{ width: `${percent}%` }}
        />
      )}
      <div className={`relative flex items-center gap-4 ${ordered ? "px-6 py-4" : "px-6 py-6"}`}>
        <span
          className="shrink-0 w-14 h-14 grid place-items-center rounded-xl text-2xl font-bold text-navy"
          style={{ background: isCorrect ? "#bc9a5f" : accent }}
        >
          {isCorrect ? <Check size={28} strokeWidth={3} /> : letter}
        </span>
        <span className={`flex-1 leading-snug ${text.length > 60 ? "text-xl lg:text-2xl" : "text-2xl lg:text-3xl"}`}>{text}</span>
        {showPct && (
          <span className="shrink-0 text-end">
            <span className="block text-3xl font-bold num">{percent}%</span>
            <span className="block text-sm text-silver num">{count}</span>
          </span>
        )}
      </div>
    </li>
  );
}

function ShortPanel({ q, phase, d }: { q: NonNullable<PresenterState["question"]>; phase: Phase; d: Dict }) {
  if (phase === "revealed" && q.correct_text)
    return (
      <div className="mt-8 max-w-4xl rounded-2xl border-2 border-gold bg-gold/15 px-6 py-6 text-3xl flex items-center gap-4 animate-pop">
        <span className="w-14 h-14 grid place-items-center rounded-xl bg-gold text-navy"><Check size={28} strokeWidth={3} /></span>
        {q.correct_text}
      </div>
    );
  return <div className="mt-8 max-w-4xl rounded-2xl border-2 border-dashed border-white/20 px-6 py-8 text-2xl text-silver">{d.short_answer_note}</div>;
}

function JoinStage({ s, d, joinUrl, origin }: { s: PresenterState; d: Dict; joinUrl: string; origin: string }) {
  const a = s.activity;
  return (
    <div className="my-auto grid place-items-center animate-fade-up">
      <div className="text-center">
        <div className="grid md:grid-cols-[auto_auto] items-center gap-12">
          {origin && <QR text={joinUrl} size={300} className="rounded-2xl overflow-hidden bg-white p-3 mx-auto" />}
          <div className="text-start">
            <div className="text-2xl text-silver">{d.join_at}</div>
            <div className="text-4xl font-bold mt-1 break-all" dir="ltr">{joinUrl.replace(/^https?:\/\//, "")}</div>
            <div className="text-2xl text-silver mt-6">{d.enter_code}</div>
            <div className="text-8xl font-bold tracking-[0.2em] gold-text num mt-1" dir="ltr">{a.join_code}</div>
            <div className="mt-6 text-xl text-silver flex items-center gap-2">
              <Users size={22} className="text-gold" />
              {a.status === "live" ? (s.participants ? `${s.participants} ${d.joined}` : d.waiting_participants) : a.status === "ended" ? d.ended_msg : d.not_started}
            </div>
          </div>
        </div>
        {a.status === "ended" && s.leaderboard.length > 0 && <Leaderboard rows={s.leaderboard.slice(0, 5)} title={d.leaderboard} />}
      </div>
    </div>
  );
}

function Leaderboard({ rows, title }: { rows: { id: number; name: string; score: number }[]; title: string }) {
  return (
    <div className="mt-8 mx-auto w-full max-w-xl text-start">
      <h2 className="text-3xl text-gold-light mb-4 flex items-center gap-2"><Trophy /> {title}</h2>
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2.5 text-2xl animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
            <span className={`w-10 h-10 grid place-items-center rounded-full num font-bold ${i < 3 ? "bg-gold text-navy" : "bg-white/10"}`}>{i + 1}</span>
            <span className="flex-1 truncate">{r.name}</span>
            <span className="num font-bold">{r.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-navy/95 backdrop-blur grid place-items-center p-8 animate-pop" onClick={onClose}>
      <button className="absolute top-5 end-5 text-silver hover:text-white" onClick={onClose} aria-label="close"><X size={28} /></button>
      <div onClick={(e) => e.stopPropagation()} className="w-full flex justify-center">{children}</div>
    </div>
  );
}

function CtrlButton({ children, icon, onClick, disabled, primary, active }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
        primary ? "bg-gold text-navy hover:bg-gold-light" : active ? "bg-white/20 text-white" : "bg-white/5 text-white hover:bg-white/15"
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}

function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className="w-10 h-10 grid place-items-center rounded-xl bg-white/5 hover:bg-white/15 text-white">
      {children}
    </button>
  );
}
