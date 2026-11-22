import "server-only";
import { cookies } from "next/headers";
import { all, get, now, run, SNAPSHOT_SQL, tx } from "./db";
import { HttpError } from "./http";
import { publish, REALTIME_MODE } from "./bus";
import { checkRateLimit, clientIp, randomToken, recordFailedAttempt, secureCookies, sha256 } from "./auth";
import { getActivity, listQuestions, parseQuestion, touchCourse, type Activity } from "./repo";
import { describeAnswer, grade, sanitizeAnswer, seededShuffle, type AnswerPayload, type Question, type TfLabels } from "./questions";

/** Small grace period for network latency after the timer hits zero. */
const GRACE_MS = 1500;

export type QState = Activity["q_state"];

/** Applies the timer: an "open" question whose deadline passed is closed. */
async function settle<T extends Activity>(a: T): Promise<T> {
  if (a.q_state === "open" && a.q_deadline && now() > a.q_deadline + GRACE_MS) {
    await run("UPDATE activities SET q_state = 'closed' WHERE id = ? AND q_state = 'open'", a.id);
    await publish(a.id, "state");
    return { ...a, q_state: "closed" };
  }
  return a;
}

// ======================= Trainer controls =======================

export type ControlAction = "start" | "restart" | "goto" | "next" | "prev" | "open" | "close" | "reveal" | "end" | "show_dist" | "extend";

export async function control(trainerId: number, activityId: number, action: ControlAction, payload: { questionId?: number; seconds?: number; value?: boolean } = {}) {
  const a = await getActivity(trainerId, activityId);
  const qs = await listQuestions(activityId);
  const t = now();
  const idx = qs.findIndex((q) => q.id === a.current_question_id);
  const set = async (sql: string, ...args: unknown[]) => await run(`UPDATE activities SET ${sql}, updated_at = ? WHERE id = ?`, ...args, t, activityId);

  const newRun = async () => {
    if (qs.length === 0) throw new HttpError(400, "no_questions");
    await tx(async () => {
            if (a.current_run_id) await run("UPDATE runs SET ended_at = COALESCE(ended_at, ?) WHERE id = ?", t, a.current_run_id);
            const n = (await get("SELECT COALESCE(MAX(number), 0) + 1 AS n FROM runs WHERE activity_id = ?", activityId) as { n: number }).n;
            const r = await run("INSERT INTO runs(activity_id, number, started_at) VALUES (?, ?, ?)", activityId, n, t);
            await set("status = 'live', current_run_id = ?, current_question_id = ?, q_state = 'idle', q_opened_at = NULL, q_deadline = NULL, q_show_dist = 0", r.lastId, qs[0].id);
            await run("UPDATE courses SET status = 'active', updated_at = ? WHERE id = ? AND status = 'draft'", t, a.course_id);
          });
  };

  const requireLive = () => {
    if (a.status !== "live" || !a.current_run_id) throw new HttpError(409, "activity_not_live");
  };

  switch (action) {
    case "start":
      if (a.status === "live" && a.current_run_id) break;
      await newRun();
      break;
    case "restart":
      await newRun();
      break;
    case "goto": {
      requireLive();
      const q = qs.find((x) => x.id === Number(payload.questionId));
      if (!q) throw new HttpError(404, "question_not_found");
      await set("current_question_id = ?, q_state = 'idle', q_opened_at = NULL, q_deadline = NULL, q_show_dist = 0", q.id);
      break;
    }
    case "next":
    case "prev": {
      requireLive();
      const target = qs[idx + (action === "next" ? 1 : -1)];
      if (!target) throw new HttpError(400, "no_more_questions");
      await set("current_question_id = ?, q_state = 'idle', q_opened_at = NULL, q_deadline = NULL, q_show_dist = 0", target.id);
      break;
    }
    case "open": {
      requireLive();
      const q = qs[idx];
      if (!q) throw new HttpError(400, "no_current_question");
      const secs = payload.seconds !== undefined ? Math.max(0, Math.min(3600, Math.round(Number(payload.seconds)))) : q.time_limit;
      await tx(async () => {
                  await set("q_state = 'open', q_opened_at = ?, q_deadline = ?", t, secs > 0 ? t + secs * 1000 : null);
                  // Record the question exactly as asked. If it was edited before anyone answered, refresh the snapshot.
                  await run(`INSERT INTO run_questions(run_id, question_id, opened_at, snapshot) SELECT ?, q.id, ?, ${SNAPSHOT_SQL} FROM questions q WHERE q.id = ?
             ON CONFLICT(run_id, question_id) DO UPDATE SET snapshot = excluded.snapshot
             WHERE NOT EXISTS (SELECT 1 FROM answers WHERE run_id = excluded.run_id AND question_id = excluded.question_id)`, a.current_run_id, t, q.id);
                });
      break;
    }
    case "close":
      requireLive();
      await set("q_state = 'closed', q_deadline = NULL");
      break;
    case "reveal":
      requireLive();
      if (!a.current_question_id) throw new HttpError(400, "no_current_question");
      await set("q_state = 'revealed', q_deadline = NULL, q_show_dist = 1");
      break;
    case "show_dist":
      requireLive();
      if (!a.current_question_id) throw new HttpError(400, "no_current_question");
      await set("q_show_dist = ?", payload.value === undefined ? (a.q_show_dist ? 0 : 1) : payload.value ? 1 : 0);
      break;
    case "extend": {
      requireLive();
      const cur = await settle(a);
      if (cur.q_state !== "open" || !cur.q_deadline) throw new HttpError(409, "not_timed");
      const secs = Math.max(5, Math.min(600, Math.round(Number(payload.seconds ?? 15))));
      await set("q_deadline = ?", Math.max(cur.q_deadline, t) + secs * 1000);
      break;
    }
    case "end":
      if (a.status !== "live") break;
      await tx(async () => {
                  if (a.current_run_id) await run("UPDATE runs SET ended_at = ? WHERE id = ?", t, a.current_run_id);
                  await set("status = 'ended', q_state = 'idle', q_deadline = NULL");
                });
      break;
    default:
      throw new HttpError(400, "unknown_action");
  }
  await touchCourse(a.course_id);
  await publish(activityId, "state");
}

/** Trainer overrides the grading of one answer (e.g. short text / scenario review). */
export async function gradeAnswer(trainerId: number, answerId: number, correct: boolean) {
  const row = await get(`SELECT ans.id, ans.question_id, r.activity_id FROM answers ans JOIN runs r ON r.id = ans.run_id
       JOIN activities a ON a.id = r.activity_id JOIN courses c ON c.id = a.course_id
       WHERE ans.id = ? AND c.trainer_id = ?`, answerId, trainerId) as { id: number; question_id: number; activity_id: number } | undefined;
  if (!row) throw new HttpError(404, "not_found");
  // points as they were when the question was asked
  const snap = await get("SELECT snapshot FROM run_questions WHERE run_id = (SELECT run_id FROM answers WHERE id = ?) AND question_id = ?", answerId, row.question_id) as { snapshot: string | null } | undefined;
  const points = snap?.snapshot
    ? (JSON.parse(snap.snapshot) as { points: number }).points
    : (await get("SELECT points FROM questions WHERE id = ?", row.question_id) as { points: number }).points;
  await run("UPDATE answers SET is_correct = ?, score = ?, graded_by = 'trainer' WHERE id = ?", correct ? 1 : 0, correct ? points : 0, answerId);
  await publish(row.activity_id, "answer");
}

export async function removeParticipant(trainerId: number, activityId: number, participantId: number) {
  const a = await getActivity(trainerId, activityId);
  const r = await run("DELETE FROM participants WHERE id = ? AND run_id = ?", participantId, a.current_run_id);
  if (!r.changes) throw new HttpError(404, "not_found");
  await publish(activityId, "participant");
}

// ======================= Trainer live state =======================

export async function trainerLiveState(trainerId: number, activityId: number, tf?: TfLabels) {
  const a = await settle(await getActivity(trainerId, activityId));
  const qs = await listQuestions(activityId);
  const current = qs.find((q) => q.id === a.current_question_id) ?? null;
  const runId = a.current_run_id;

  const participants = runId
    ? (await all("SELECT id, display_name, trainee_number, joined_at FROM participants WHERE run_id = ? ORDER BY joined_at", runId) as {
        id: number;
        display_name: string;
        trainee_number: string | null;
        joined_at: number;
      }[])
    : [];

  let answers: { id: number; participant_id: number; name: string; trainee_number: string | null; text: string; is_correct: number | null; graded_by: string; submitted_at: number }[] = [];
  let distribution: { id: string; text: string; count: number; correct: boolean }[] = [];
  if (runId && current) {
    const rows = await all(`SELECT ans.id, ans.participant_id, ans.answer, ans.is_correct, ans.graded_by, ans.submitted_at, p.display_name AS name, p.trainee_number
         FROM answers ans JOIN participants p ON p.id = ans.participant_id
         WHERE ans.run_id = ? AND ans.question_id = ? ORDER BY ans.submitted_at`, runId, current.id) as { id: number; participant_id: number; answer: string; is_correct: number | null; graded_by: string; submitted_at: number; name: string; trainee_number: string | null }[];
    answers = rows.map((r) => ({ ...r, text: describeAnswer(current, JSON.parse(r.answer), tf) }));
    if (current.type !== "short" && current.type !== "order") {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const p = JSON.parse(r.answer) as AnswerPayload;
        const ids = "choice" in p ? [p.choice] : "choices" in p ? p.choices : "order" in p ? [p.order[0]] : [];
        for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      distribution = current.options.map((o) => ({ id: o.id, text: o.text, count: counts.get(o.id) ?? 0, correct: current.correct.includes(o.id) }));
    }
  }

  const outcome = {
    correct: answers.filter((x) => x.is_correct === 1).length,
    wrong: answers.filter((x) => x.is_correct === 0).length,
    pending: answers.filter((x) => x.is_correct === null).length,
  };
  const leaderboard = runId && a.show_leaderboard ? await runLeaderboard(runId, 10) : [];
  const run = runId ? (await get("SELECT id, number, started_at, ended_at FROM runs WHERE id = ?", runId) as { id: number; number: number; started_at: number; ended_at: number | null }) : null;
  const askedIds = runId ? (await all("SELECT question_id FROM run_questions WHERE run_id = ?", runId) as { question_id: number }[]).map((r) => r.question_id) : [];

  return {
    activity: {
      id: a.id,
      title: a.title,
      course_id: a.course_id,
      course_title: a.course_title,
      course_mode: a.course_mode,
      join_code: a.join_code,
      status: a.status,
      q_state: a.q_state,
      q_deadline: a.q_deadline,
      identity_mode: a.identity_mode,
      allow_late_edit: !!a.allow_late_edit,
      reveal_to_trainees: !!a.reveal_to_trainees,
      show_leaderboard: !!a.show_leaderboard,
      q_show_dist: !!a.q_show_dist,
    },
    server_now: now(),
    rev: a.rev,
    realtime: REALTIME_MODE,
    run,
    outcome,
    questions: qs.map((q) => ({ id: q.id, title: q.title || q.body.slice(0, 80), type: q.type, asked: askedIds.includes(q.id) })),
    current,
    current_index: current ? qs.findIndex((q) => q.id === current.id) : -1,
    participants,
    answers,
    distribution,
    leaderboard,
  };
}
export type TrainerLiveState = Awaited<ReturnType<typeof trainerLiveState>>;

export async function runLeaderboard(runId: number, limit = 1000) {
  return await all(`SELECT p.id, p.display_name AS name, p.trainee_number, COALESCE(SUM(ans.score), 0) AS score,
              COALESCE(SUM(CASE WHEN ans.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct
       FROM participants p LEFT JOIN answers ans ON ans.participant_id = p.id
       WHERE p.run_id = ? GROUP BY p.id ORDER BY score DESC, correct DESC, p.joined_at ASC LIMIT ?`, runId, limit) as { id: number; name: string; trainee_number: string | null; score: number; correct: number }[];
}

// ======================= Trainee side =======================
//
// Trainees never authenticate as trainers. They hold one random token per
// activity, stored in an httpOnly cookie scoped to /api/play and bound to a
// single run. Everything they receive is built here and filtered for them.

type PublicActivity = Activity & { course_title: string };

/** Unknown-code lookups are rate limited so the 6-digit code space can't be scanned. */
const CODE_FAILS_MAX = 30;

export async function activityByCode(code: string): Promise<PublicActivity> {
  const key = `code:${await clientIp()}`;
  await checkRateLimit(key, CODE_FAILS_MAX);
  const clean = String(code).replace(/\D/g, "").slice(0, 6);
  const a =
    clean.length === 6
      ? (await get("SELECT a.*, c.title AS course_title FROM activities a JOIN courses c ON c.id = a.course_id WHERE a.join_code = ? AND c.status != 'archived'", clean) as PublicActivity | undefined)
      : undefined;
  if (!a) {
    await recordFailedAttempt(key);
    throw new HttpError(404, "activity_not_found");
  }
  return await settle(a);
}

const pCookie = (activityId: number) => `safe_p_${activityId}`;
export const TRAINEE_COOKIE_PATH = "/api/play";

type Participant = { id: number; run_id: number; display_name: string; trainee_number: string | null };

async function currentParticipant(a: Activity): Promise<Participant | null> {
  if (!a.current_run_id) return null;
  const token = (await cookies()).get(pCookie(a.id))?.value;
  if (!token || token.length > 100) return null;
  return (
    (await get("SELECT id, run_id, display_name, trainee_number FROM participants WHERE token_hash = ? AND run_id = ?", sha256(token), a.current_run_id) as Participant | undefined) ?? null
  );
}

export async function joinActivity(code: string, name: string, traineeNumber: string) {
  const a = await activityByCode(code);
  if (a.status !== "live" || !a.current_run_id) throw new HttpError(409, "activity_not_live");
  const existing = await currentParticipant(a);
  if (existing) return existing;
  const display = name.replace(/\s+/g, " ").trim().slice(0, 80);
  const number = traineeNumber.replace(/\s+/g, "").slice(0, 40);
  if (!display) throw new HttpError(400, "name_required");
  if (a.identity_mode === "name_id" && !number) throw new HttpError(400, "trainee_number_required");
  const token = randomToken();
  const r = await run("INSERT INTO participants(run_id, display_name, trainee_number, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)", a.current_run_id, display, a.identity_mode === "name_id" ? number : null, sha256(token), now());
  (await cookies()).set(pCookie(a.id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: TRAINEE_COOKIE_PATH,
    maxAge: 60 * 60 * 24,
  });
  await publish(a.id, "participant");
  return { id: r.lastId, run_id: a.current_run_id, display_name: display, trainee_number: number || null };
}

type TraineeQuestion = {
  id: number;
  type: Question["type"];
  title: string;
  body: string;
  image: string | null;
  options: { id: string; text: string }[];
  points: number;
  time_limit: number;
  deadline: number | null;
  index: number;
  total: number;
};

/**
 * What a trainee may see — an explicit whitelist. Never contains: correct answers or
 * explanations (unless revealed AND allowed by the trainer), other participants,
 * other answers, distribution, scores of others, or internal ids beyond the current question.
 */
export async function traineeState(code: string) {
  const a = await activityByCode(code);
  const me = await currentParticipant(a);
  const base = {
    activity: {
      title: a.title,
      course_title: a.course_title,
      status: a.status,
      identity_mode: a.identity_mode,
      code: a.join_code,
      allow_change: !!a.allow_change,
    },
    server_now: now(),
    rev: a.rev,
    realtime: REALTIME_MODE,
    me: me ? { name: me.display_name, trainee_number: me.trainee_number } : null,
    q_state: a.q_state as QState,
    question: null as null | TraineeQuestion,
    my_answer: null as null | AnswerPayload,
    can_answer: false,
    answer_locked: false,
    reveal: null as null | { correct: string[]; explanation: string; is_correct: boolean | null; correct_text: string },
    my_score: 0,
    my_answered: 0,
  };
  if (!me) return base;
  const mineAll = await get("SELECT COUNT(*) c, COALESCE(SUM(score),0) s FROM answers WHERE participant_id = ?", me.id) as { c: number; s: number };
  base.my_score = mineAll.s;
  base.my_answered = mineAll.c;
  if (a.status !== "live" || !a.current_question_id) return base;
  // Before the trainer starts a question, trainees only see a waiting screen.
  if (a.q_state === "idle") return base;

  const row = await get("SELECT * FROM questions WHERE id = ? AND activity_id = ?", a.current_question_id, a.id);
  if (!row) return base;
  const q = parseQuestion(row as never);
  const allIds = await all("SELECT id FROM questions WHERE activity_id = ? AND deleted_at IS NULL ORDER BY position, id", a.id) as { id: number }[];

  base.question = {
    id: q.id,
    type: q.type,
    title: q.title,
    body: q.body,
    image: q.image,
    options: (q.type === "order" ? seededShuffle(q.options, me.id * 7919 + q.id) : q.options).map((o) => ({ id: o.id, text: o.text })),
    points: q.points,
    time_limit: q.time_limit,
    deadline: a.q_state === "open" ? a.q_deadline : null,
    index: allIds.findIndex((x) => x.id === q.id) + 1,
    total: allIds.length,
  };
  const mine = await get("SELECT answer, is_correct FROM answers WHERE run_id = ? AND question_id = ? AND participant_id = ?", a.current_run_id, q.id, me.id) as { answer: string; is_correct: number | null } | undefined;
  base.my_answer = mine ? JSON.parse(mine.answer) : null;
  const answerWindow = a.q_state === "open" || (a.q_state === "closed" && !!a.allow_late_edit);
  base.answer_locked = !!mine && !a.allow_change;
  base.can_answer = answerWindow && !base.answer_locked;
  if (a.q_state === "revealed" && a.reveal_to_trainees) {
    base.reveal = {
      correct: q.correct,
      explanation: q.explanation,
      is_correct: mine ? (mine.is_correct === null ? null : !!mine.is_correct) : null,
      correct_text: q.type === "short" ? q.correct.join(" / ") : "",
    };
  }
  return base;
}
export type TraineeState = Awaited<ReturnType<typeof traineeState>>;

export async function submitAnswer(code: string, questionId: number, raw: unknown) {
  const a = await activityByCode(code);
  if (a.status !== "live" || !a.current_run_id) throw new HttpError(409, "activity_not_live");
  const me = await currentParticipant(a);
  if (!me) throw new HttpError(401, "not_joined");
  if (a.current_question_id !== questionId) throw new HttpError(409, "question_not_active");
  const open = a.q_state === "open";
  const lateEditAllowed = a.q_state === "closed" && !!a.allow_late_edit;
  if (!open && !lateEditAllowed) throw new HttpError(409, "answers_closed");

  const row = await get("SELECT * FROM questions WHERE id = ? AND activity_id = ?", questionId, a.id);
  if (!row) throw new HttpError(404, "question_not_found");
  const q = parseQuestion(row as never);
  const payload = sanitizeAnswer(q, raw);
  if (!payload) throw new HttpError(400, "invalid_answer");
  const result = grade(q, payload);
  const score = result ? q.points : 0;
  const t = now();
  const values = [a.current_run_id, q.id, me.id, JSON.stringify(payload), result === null ? null : result ? 1 : 0, score, result === null ? "pending" : "auto", t, t];
  const insert = `INSERT INTO answers(run_id, question_id, participant_id, answer, is_correct, score, graded_by, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  if (a.allow_change) {
    await run(`${insert} ON CONFLICT(run_id, question_id, participant_id) DO UPDATE SET
         answer = excluded.answer, is_correct = excluded.is_correct, score = excluded.score,
         graded_by = excluded.graded_by, updated_at = excluded.updated_at`, ...values);
  } else {
    // Single answer only: the unique key makes this atomic, so double taps or
    // parallel requests can never store a second answer.
    const r = await run(`${insert} ON CONFLICT(run_id, question_id, participant_id) DO NOTHING`, ...values);
    if (r.changes === 0) throw new HttpError(409, "already_answered");
  }
  await publish(a.id, "answer");
  return { ok: true };
}

// ======================= Presenter (projected) view =======================

/**
 * State for the projector / shared screen, which trainees can see.
 * Built server-side so that, until the trainer reveals the question:
 *  - no correct answer, accepted answers or explanation is sent,
 *  - ordering steps are shuffled (the authored order IS the answer),
 *  - answer distribution is only sent when the trainer chooses to show it.
 * Individual answers and trainee names are never sent (except the opt-in ranking).
 */
export async function presenterState(trainerId: number, activityId: number) {
  const s = await trainerLiveState(trainerId, activityId);
  const a = s.activity;
  const q = s.current;
  const revealed = a.q_state === "revealed";
  const showDist = revealed || a.q_show_dist;
  const answered = s.answers.length;
  const pct = (n: number) => (answered ? Math.round((n / answered) * 1000) / 10 : 0);

  let question = null as null | {
    id: number;
    type: Question["type"];
    title: string;
    body: string;
    image: string | null;
    points: number;
    time_limit: number;
    difficulty: Question["difficulty"];
    options: { id: string; text: string; count: number | null; percent: number | null; correct: boolean | null }[];
    correct_text: string | null;
    explanation: string | null;
  };
  if (q && a.status === "live") {
    const ordered = q.type === "order" && !revealed ? seededShuffle(q.options, q.id * 104729) : q.options;
    question = {
      id: q.id,
      type: q.type,
      title: q.title,
      body: q.body,
      image: q.image,
      points: q.points,
      time_limit: q.time_limit,
      difficulty: q.difficulty,
      options: ordered.map((o) => {
        const dist = s.distribution.find((x) => x.id === o.id);
        return {
          id: o.id,
          text: o.text,
          count: showDist && dist ? dist.count : null,
          percent: showDist && dist ? pct(dist.count) : null,
          correct: revealed && q.type !== "order" ? q.correct.includes(o.id) : null,
        };
      }),
      correct_text: revealed ? (q.type === "short" ? q.correct.join(" / ") : null) : null,
      explanation: revealed ? q.explanation || null : null,
    };
  }

  return {
    activity: {
      id: a.id,
      title: a.title,
      course_title: a.course_title,
      join_code: a.join_code,
      status: a.status,
      q_state: a.q_state,
      q_deadline: a.q_deadline,
      q_show_dist: showDist,
      show_leaderboard: a.show_leaderboard,
    },
    server_now: s.server_now,
    rev: s.rev,
    realtime: s.realtime,
    run: s.run ? { number: s.run.number } : null,
    index: s.current_index,
    total: s.questions.length,
    participants: s.participants.length,
    answered,
    question,
    // correct/wrong split would reveal the answer, so it's only sent after reveal
    outcome: revealed ? s.outcome : null,
    leaderboard: revealed || a.status === "ended" ? s.leaderboard.map((r) => ({ id: r.id, name: r.name, score: r.score })) : [],
  };
}
export type PresenterState = Awaited<ReturnType<typeof presenterState>>;


// ======================= Cheap "anything changed?" checks for polling =======================

/** True when the client already has the latest state (and no timer is due to expire). */
function unchanged(row: { rev: number; q_state: string; q_deadline: number | null } | undefined, rev: number) {
  if (!row || row.rev !== rev) return false;
  // an open question whose time ran out must be settled by a full read
  return !(row.q_state === "open" && row.q_deadline && now() > row.q_deadline + GRACE_MS);
}

export async function trainerRevUnchanged(trainerId: number, activityId: number, rev: number) {
  const row = await get<{ rev: number; q_state: string; q_deadline: number | null }>(
    "SELECT a.rev, a.q_state, a.q_deadline FROM activities a JOIN courses c ON c.id = a.course_id WHERE a.id = ? AND c.trainer_id = ?",
    activityId,
    trainerId
  );
  return unchanged(row, rev);
}

export async function codeRevUnchanged(code: string, rev: number) {
  const clean = String(code).replace(/\D/g, "").slice(0, 6);
  if (clean.length !== 6) return false;
  const row = await get<{ rev: number; q_state: string; q_deadline: number | null }>("SELECT rev, q_state, q_deadline FROM activities WHERE join_code = ?", clean);
  return unchanged(row, rev);
}
