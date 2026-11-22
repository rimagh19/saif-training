"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Check, CheckCircle2, Clock, Hourglass, Lock, PartyPopper, RefreshCw, WifiOff, X, XCircle } from "lucide-react";
import { useI18n } from "./i18n";
import { api, ApiError } from "./api";
import { useCountdown, useLiveResource } from "./live-hooks";
import { TraineeShell } from "./trainee-shell";
import { optionText } from "./question-editor";
import type { TraineeState } from "@/lib/live";
import type { AnswerPayload } from "@/lib/questions";
import type { Dict } from "@/lib/i18n";

const PROFILE_KEY = "safe_trainee_profile";
const buzz = (ms = 15) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

/** Keeps the phone screen awake while the trainee is in an activity. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
      } catch {}
    };
    req();
    const onVis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function TraineePlay({ code }: { code: string }) {
  const { d, err } = useI18n();
  const { data: s, error, reload, serverOffset, connected } = useLiveResource<TraineeState>(`/api/play/${code}`, `/api/play/${code}/stream`);
  const left = useCountdown(s?.question?.deadline ?? null, serverOffset, reload);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  useWakeLock(!!s?.me && s.activity.status === "live");

  if (error && !s)
    return (
      <TraineeShell>
        <Centered
          icon={<XCircle size={52} className="text-bronze" />}
          title={error === "activity_not_found" ? d.err_activity_not_found : err(error)}
          sub={error === "activity_not_found" ? d.t_wrong_code : undefined}
        >
          <Link href="/join" className="btn btn-primary h-12 px-8 mt-6">{d.back}</Link>
        </Centered>
      </TraineeShell>
    );
  if (!s)
    return (
      <TraineeShell>
        <Centered icon={<Hourglass size={44} className="text-gold animate-pulse" />} title={d.loading} />
      </TraineeShell>
    );

  const a = s.activity;
  const banner = (!online || !connected) && (
    <div role="status" className="mb-3 rounded-xl bg-bronze text-white text-sm font-bold px-3 py-2 flex items-center gap-2 animate-fade-up">
      {online ? <RefreshCw size={16} className="animate-spin" /> : <WifiOff size={16} />}
      {online ? d.reconnecting : d.t_offline}
    </div>
  );

  // ----- not joined -----
  if (!s.me) {
    if (a.status === "ended")
      return (
        <TraineeShell title={a.title} subtitle={a.course_title}>
          {banner}
          <Centered icon={<PartyPopper size={52} className="text-gold" />} title={d.activity_ended} />
        </TraineeShell>
      );
    if (a.status !== "live")
      return (
        <TraineeShell title={a.title} subtitle={a.course_title}>
          {banner}
          <Centered icon={<Hourglass size={48} className="text-gold animate-pulse" />} title={d.t_waiting_start} sub={d.t_waiting_start_sub} />
        </TraineeShell>
      );
    return <DetailsForm code={code} s={s} onJoined={reload} banner={banner} />;
  }

  // ----- joined -----
  const header = { title: a.title, subtitle: `${d.t_hello} ${s.me.name}` };
  if (a.status === "ended")
    return (
      <TraineeShell {...header}>
        {banner}
        <Centered icon={<PartyPopper size={52} className="text-gold" />} title={d.activity_ended}>
          <ScoreChip d={d} score={s.my_score} />
        </Centered>
      </TraineeShell>
    );
  if (a.status !== "live" || !s.question)
    return (
      <TraineeShell {...header}>
        {banner}
        <Waiting d={d} next={s.my_answered > 0} name={s.me.name} />
      </TraineeShell>
    );
  return <QuestionScreen key={s.question.id} s={s} code={code} left={left} reload={reload} banner={banner} header={header} />;
}

// ---------------------------------------------------------------------------

function Centered({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="my-auto py-10 text-center animate-fade-up flex flex-col items-center">
      <div className="mb-5">{icon}</div>
      <h1 className="text-2xl">{title}</h1>
      {sub && <p className="text-platinum mt-2 max-w-xs">{sub}</p>}
      {children}
    </div>
  );
}

function ScoreChip({ d, score }: { d: Dict; score: number }) {
  return (
    <div className="mt-6 rounded-2xl bg-navy text-white px-6 py-3">
      <div className="text-xs text-silver">{d.your_score}</div>
      <div className="text-3xl font-bold gold-text num">{score}</div>
    </div>
  );
}

function Waiting({ d, next, name }: { d: Dict; next: boolean; name: string }) {
  return (
    <div className="my-auto py-10 text-center animate-fade-up flex flex-col items-center">
      <div className="relative w-28 h-28 mb-6">
        <span className="absolute inset-0 rounded-full bg-gold/20 animate-ping" style={{ animationDuration: "2.2s" }} />
        <span className="absolute inset-3 rounded-full bg-gold/25" />
        <span className="absolute inset-6 rounded-full bg-gold grid place-items-center text-white">
          {next ? <Hourglass size={30} /> : <Check size={34} strokeWidth={3} />}
        </span>
      </div>
      <h1 className="text-2xl">{next ? d.t_waiting_next : d.t_waiting_first}</h1>
      <p className="text-platinum mt-2 max-w-xs">{next ? d.t_waiting_next_sub : d.t_waiting_first_sub}</p>
      {!next && <p className="mt-5 badge bg-white border border-silver text-navy py-1.5 px-4">{name}</p>}
    </div>
  );
}

function DetailsForm({ code, s, onJoined, banner }: { code: string; s: TraineeState; onJoined: () => void; banner: React.ReactNode }) {
  const { d, err } = useI18n();
  const needsId = s.activity.identity_mode === "name_id";
  const saved = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(PROFILE_KEY) ?? "";
      } catch {
        return "";
      }
    },
    () => ""
  );
  const profile = (() => {
    try {
      return JSON.parse(saved || "{}") as { name?: string; number?: string };
    } catch {
      return {};
    }
  })();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <TraineeShell title={s.activity.title} subtitle={s.activity.course_title}>
      {banner}
      <form
        className="my-auto py-6 animate-fade-up"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const name = String(f.get("name") ?? "");
          const number = String(f.get("trainee_number") ?? "");
          setBusy(true);
          setError("");
          try {
            await api(`/api/play/${code}/join`, "POST", { name, trainee_number: number });
            try {
              localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, number: number || profile.number }));
            } catch {}
            buzz(30);
            onJoined();
          } catch (x) {
            setError(err(x instanceof ApiError ? x.code : undefined));
            setBusy(false);
          }
        }}
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl">{s.activity.title}</h1>
          <p className="text-platinum">{s.activity.course_title}</p>
        </div>
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="text-lg">{d.t_details_title}</h2>
            <p className="text-sm text-platinum">{needsId ? d.t_details_sub_id : d.t_details_sub_name}</p>
          </div>
          <div>
            <label className="label" htmlFor="name">{d.your_name}</label>
            <input id="name" name="name" required maxLength={80} autoComplete="name" defaultValue={profile.name} className="field h-13 text-lg" key={`n${saved}`} />
          </div>
          {needsId && (
            <div>
              <label className="label" htmlFor="trainee_number">{d.your_number}</label>
              <input id="trainee_number" name="trainee_number" required maxLength={40} inputMode="numeric" autoComplete="off" defaultValue={profile.number} key={`i${saved}`} className="field h-13 text-lg num" dir="ltr" />
            </div>
          )}
          {error && <p role="alert" className="text-bronze font-bold">{error}</p>}
          <button className="btn btn-primary w-full h-14 text-lg" disabled={busy}>{busy ? d.loading : d.join_btn}</button>
        </div>
      </form>
    </TraineeShell>
  );
}

// ---------------------------------------------------------------------------

function QuestionScreen({ s, code, left, reload, banner, header }: {
  s: TraineeState; code: string; left: number | null; reload: () => void; banner: React.ReactNode; header: { title: string; subtitle: string };
}) {
  const { d, err } = useI18n();
  const q = s.question!;
  const mine = s.my_answer;
  const [choice, setChoice] = useState<string | null>(mine && "choice" in mine ? mine.choice : null);
  const [choices, setChoices] = useState<string[]>(mine && "choices" in mine ? mine.choices : []);
  const [text, setText] = useState(mine && "text" in mine ? mine.text : "");
  const [order, setOrder] = useState<string[]>(mine && "order" in mine ? mine.order : q.options.map((o) => o.id));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const timeUp = s.q_state === "open" && q.deadline !== null && left === 0;
  const canSubmit = s.can_answer && !timeUp;
  const answering = canSubmit && (!mine || editing);
  const label = (id: string) => optionText(d, q.type, q.options.find((o) => o.id === id) ?? { id, text: id });
  const correctSet = new Set(s.reveal?.correct ?? []);

  const payload = (): AnswerPayload | null => {
    if (q.type === "multi") return choices.length ? { choices } : null;
    if (q.type === "short") return text.trim() ? { text: text.trim() } : null;
    if (q.type === "order") return { order };
    return choice ? { choice } : null;
  };
  const ready = !!payload();

  const submit = async () => {
    const p = payload();
    if (!p || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/play/${code}/answer`, "POST", { question_id: q.id, answer: p });
      buzz(40);
      setEditing(false);
      reload();
    } catch (x) {
      setError(err(x instanceof ApiError ? x.code : undefined));
      reload();
    } finally {
      setBusy(false);
    }
  };

  const describe = (a: AnswerPayload | null) => {
    if (!a) return "";
    if ("choice" in a) return label(a.choice);
    if ("choices" in a) return a.choices.map(label).join("، ");
    if ("order" in a) return a.order.map((id, i) => `${i + 1}. ${label(id)}`).join("\n");
    return a.text;
  };

  const footer = answering ? (
    <div>
      {error && <p role="alert" className="text-bronze font-bold text-center mb-2">{error}</p>}
      <button className="btn btn-primary w-full h-14 text-lg shadow-lg" disabled={busy || !ready} onClick={submit}>
        {busy ? d.t_sending : mine ? d.update_answer : d.submit_answer}
      </button>
      {!ready && <p className="text-center text-xs text-platinum mt-1.5">{q.type === "short" ? d.t_type_first : d.t_choose_first}</p>}
    </div>
  ) : undefined;

  return (
    <TraineeShell {...header} footer={footer}>
      {banner}
      {/* progress + timer */}
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="font-bold text-platinum num">{d.question_of} {q.index} {d.of} {q.total}</span>
        {s.q_state === "open" && (
          <span className={`flex items-center gap-1 rounded-full px-3 py-1 font-bold num ${timeUp ? "bg-bronze text-white" : left !== null && left <= 5 ? "bg-bronze/15 text-bronze" : "bg-white text-navy"}`}>
            <Clock size={15} /> {timeUp ? d.t_time_up : left === null ? "∞" : Math.min(left, q.time_limit || left)}
          </span>
        )}
        {s.q_state !== "open" && <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-platinum"><Lock size={14} /> {d.answers_closed_msg}</span>}
      </div>
      {s.q_state === "open" && q.deadline && q.time_limit > 0 && left !== null && (
        <div className="h-1.5 rounded-full bg-white mb-4 overflow-hidden">
          <div className={`h-full transition-[width] duration-300 ${left <= 5 ? "bg-bronze" : "bg-gold"}`} style={{ width: `${Math.min(100, (left / q.time_limit) * 100)}%` }} />
        </div>
      )}

      {/* question */}
      <section className="card p-5 animate-fade-up">
        {q.title && <h1 className="text-[1.45rem] leading-snug">{q.title}</h1>}
        {q.body && <p className={`whitespace-pre-line text-navy/85 ${q.title ? "mt-2" : "text-xl font-bold"} ${q.type === "scenario" ? "rounded-xl bg-sand p-3 mt-3" : ""}`}>{q.body}</p>}
        {q.image && <img src={`/api/uploads/${q.image}`} alt="" className="mt-3 w-full max-h-60 object-contain rounded-xl bg-sand" />}
      </section>

      {/* answer area */}
      {answering ? (
        <AnswerInput q={q} d={d} choice={choice} setChoice={setChoice} choices={choices} setChoices={setChoices} text={text} setText={setText} order={order} setOrder={setOrder} label={label} />
      ) : mine ? (
        <div className="mt-4 space-y-3">
          {s.reveal ? (
            <RevealCard s={s} d={d} label={label} />
          ) : (
            <div className="card p-5 text-center border-2 border-forest/30 animate-pop">
              <div className="mx-auto w-16 h-16 rounded-full bg-forest text-white grid place-items-center mb-3">
                <Check size={34} strokeWidth={3} />
              </div>
              <h2 className="text-xl text-forest">{d.answer_received}</h2>
              <div className="mt-3 rounded-xl bg-sand px-4 py-3 text-start">
                <div className="text-xs text-platinum">{d.t_your_answer}</div>
                <div className="font-bold whitespace-pre-line">{describe(mine)}</div>
              </div>
              {canSubmit && s.activity.allow_change ? (
                <button className="btn btn-outline mt-4 h-12 w-full" onClick={() => setEditing(true)}>{d.t_change_answer}</button>
              ) : s.answer_locked && s.q_state === "open" ? (
                <p className="mt-3 text-sm text-platinum flex items-center justify-center gap-1.5"><Lock size={14} /> {d.t_answer_locked}</p>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {s.reveal ? (
            <RevealCard s={s} d={d} label={label} />
          ) : (
            <div className="card p-5 text-center">
              <Lock className="mx-auto text-platinum mb-2" />
              <p className="font-bold">{timeUp ? d.t_time_up : d.answers_closed_msg}</p>
              <p className="text-sm text-platinum mt-1">{d.t_missed}</p>
            </div>
          )}
          {timeUp && <NextHint d={d} />}
        </div>
      )}

      {/* correct answer highlight for choice questions after reveal */}
      {s.reveal && (q.type === "mcq" || q.type === "tf" || q.type === "scenario" || q.type === "multi") && (
        <ul className="mt-3 space-y-2">
          {q.options.map((o) => {
            const ok = correctSet.has(o.id);
            const picked = mine && ("choice" in mine ? mine.choice === o.id : "choices" in mine ? mine.choices.includes(o.id) : false);
            return (
              <li key={o.id} className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 ${ok ? "border-forest bg-forest/10" : picked ? "border-bronze/60 bg-white" : "border-transparent bg-white/60 text-platinum"}`}>
                {ok ? <CheckCircle2 size={20} className="text-forest shrink-0" /> : picked ? <X size={20} className="text-bronze shrink-0" /> : <span className="w-5" />}
                <span className="flex-1">{optionText(d, q.type, o)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {!answering && s.q_state !== "open" && <NextHint d={d} />}
    </TraineeShell>
  );
}

function NextHint({ d }: { d: Dict }) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-platinum py-2">
      <Hourglass size={15} className="animate-pulse" /> {d.t_waiting_next}
    </div>
  );
}

function RevealCard({ s, d, label }: { s: TraineeState; d: Dict; label: (id: string) => string }) {
  const r = s.reveal!;
  const q = s.question!;
  const ok = r.is_correct;
  return (
    <div className={`card p-5 border-2 animate-pop ${!s.my_answer ? "border-silver" : ok === true ? "border-forest" : ok === false ? "border-bronze" : "border-gold"}`}>
      <div className="flex items-center gap-3">
        {!s.my_answer ? <Lock className="text-platinum" /> : ok === true ? <CheckCircle2 size={30} className="text-forest" /> : ok === false ? <XCircle size={30} className="text-bronze" /> : <Hourglass className="text-gold" />}
        <h2 className="text-xl">{!s.my_answer ? d.no_answer_sent : ok === true ? d.your_answer_correct : ok === false ? d.your_answer_wrong : d.your_answer_pending}</h2>
      </div>
      {q.type === "order" && (
        <ol className="mt-3 space-y-1 text-sm">
          {r.correct.map((id, i) => <li key={id} className="flex gap-2"><b className="num text-forest">{i + 1}.</b> {label(id)}</li>)}
        </ol>
      )}
      {q.type === "short" && r.correct_text && <p className="mt-3 text-sm"><b>{d.correct_answer}:</b> {r.correct_text}</p>}
      {r.explanation && <p className="mt-3 text-navy/80 text-sm leading-relaxed">{r.explanation}</p>}
    </div>
  );
}

type AnswerProps = {
  q: NonNullable<TraineeState["question"]>;
  d: Dict;
  choice: string | null;
  setChoice: (v: string) => void;
  choices: string[];
  setChoices: (f: (c: string[]) => string[]) => void;
  text: string;
  setText: (v: string) => void;
  order: string[];
  setOrder: (f: (o: string[]) => string[]) => void;
  label: (id: string) => string;
};

function AnswerInput({ q, d, choice, setChoice, choices, setChoices, text, setText, order, setOrder, label }: AnswerProps) {
  const hint = q.type === "multi" ? d.choose_many : q.type === "order" ? d.arrange : q.type === "short" ? d.type_answer : d.choose_one;
  return (
    <section className="mt-4">
      <p className="text-sm text-platinum mb-2 px-1">{hint}</p>

      {q.type === "tf" && (
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {q.options.map((o) => {
            const sel = choice === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => { setChoice(o.id); buzz(); }}
                className={`h-28 rounded-2xl border-2 text-2xl font-bold flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.97] ${sel ? "border-gold bg-gold text-white shadow-md" : "border-silver bg-white"}`}
              >
                {o.id === "true" ? <Check size={30} /> : <X size={30} />}
                {o.id === "true" ? d.tf_true : d.tf_false}
              </button>
            );
          })}
        </div>
      )}

      {(q.type === "mcq" || q.type === "scenario" || q.type === "multi") && (
        <ul className="space-y-2.5" role={q.type === "multi" ? "group" : "radiogroup"}>
          {q.options.map((o, i) => {
            const multi = q.type === "multi";
            const sel = multi ? choices.includes(o.id) : choice === o.id;
            return (
              <li key={o.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                <button
                  type="button"
                  role={multi ? "checkbox" : "radio"}
                  aria-checked={sel}
                  onClick={() => {
                    buzz();
                    if (multi) setChoices((c) => (c.includes(o.id) ? c.filter((x) => x !== o.id) : [...c, o.id]));
                    else setChoice(o.id);
                  }}
                  className={`w-full min-h-[3.75rem] text-start flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-[1.05rem] leading-snug transition-all active:scale-[0.98] ${
                    sel ? "border-gold bg-gold/10 shadow-sm" : "border-silver/70 bg-white"
                  }`}
                >
                  <span className={`shrink-0 w-7 h-7 grid place-items-center border-2 transition-colors ${multi ? "rounded-lg" : "rounded-full"} ${sel ? "bg-gold border-gold text-white" : "border-silver"}`}>
                    {sel && <Check size={16} strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{o.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {q.type === "short" && (
        <textarea
          className="field !text-lg !rounded-2xl !p-4 min-h-32"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={d.type_answer}
          enterKeyHint="done"
        />
      )}

      {q.type === "order" && (
        <ol className="space-y-2">
          {order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-2xl border-2 border-silver/70 bg-white ps-3 pe-1.5 py-1.5 transition-all">
              <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full bg-navy text-white text-sm font-bold num">{i + 1}</span>
              <span className="flex-1 py-2 leading-snug">{label(id)}</span>
              <span className="flex flex-col shrink-0">
                <button type="button" aria-label={d.move_up} className="w-11 h-9 grid place-items-center rounded-lg active:bg-sand disabled:opacity-25" disabled={i === 0}
                  onClick={() => { buzz(); setOrder((o) => { const n = [...o]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; }); }}>
                  <ArrowUp size={20} />
                </button>
                <button type="button" aria-label={d.move_down} className="w-11 h-9 grid place-items-center rounded-lg active:bg-sand disabled:opacity-25" disabled={i === order.length - 1}
                  onClick={() => { buzz(); setOrder((o) => { const n = [...o]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; }); }}>
                  <ArrowDown size={20} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
