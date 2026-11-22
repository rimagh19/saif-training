import "server-only";
import { db } from "./db";
import { HttpError } from "./http";
import { getActivity, getCourse, listQuestions } from "./repo";
import { describeAnswer, describeCorrect, type AnswerPayload, type Question, type TfLabels } from "./questions";

export type RunRow = { id: number; number: number; started_at: number; ended_at: number | null; participants: number };

export function activityRuns(activityId: number): RunRow[] {
  return db()
    .prepare(
      `SELECT r.id, r.number, r.started_at, r.ended_at, (SELECT COUNT(*) FROM participants p WHERE p.run_id = r.id) AS participants
       FROM runs r WHERE r.activity_id = ? ORDER BY r.number DESC`
    )
    .all(activityId) as RunRow[];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

export function activityReport(trainerId: number, activityId: number, runId?: number, tf?: TfLabels) {
  const activity = getActivity(trainerId, activityId);
  const runs = activityRuns(activityId);
  const run = runId ? runs.find((r) => r.id === runId) : runs[0];
  if (runId && !run) throw new HttpError(404, "not_found");
  const allQs = listQuestions(activityId);
  if (!run) {
    return { activity, runs, run: null, questions: [], participants: [], summary: null, questionStats: [], matrix: [] as never[], generated_at: Date.now() };
  }

  // Questions exactly as they were asked in this run (snapshots), so later edits
  // or deletions of the activity question never change past results.
  const snaps = db()
    .prepare("SELECT question_id, snapshot FROM run_questions WHERE run_id = ? AND snapshot IS NOT NULL")
    .all(run.id) as { question_id: number; snapshot: string }[];
  const livePos = new Map(allQs.map((q, i) => [q.id, i]));
  const questions: (Question & { display_position: number })[] = snaps
    .map((r) => JSON.parse(r.snapshot) as Question)
    .sort((x, y) => (livePos.get(x.id) ?? 1e6 + x.position) - (livePos.get(y.id) ?? 1e6 + y.position))
    .map((q, i) => ({ ...q, display_position: i + 1 }));
  const askedIds = new Set(questions.map((q) => q.id));
  const maxScore = questions.reduce((s, q) => s + q.points, 0);

  const people = db()
    .prepare("SELECT id, display_name, trainee_number, joined_at FROM participants WHERE run_id = ? ORDER BY joined_at")
    .all(run.id) as { id: number; display_name: string; trainee_number: string | null; joined_at: number }[];
  const answers = db()
    .prepare("SELECT id, participant_id, question_id, answer, is_correct, score, graded_by FROM answers WHERE run_id = ?")
    .all(run.id) as { id: number; participant_id: number; question_id: number; answer: string; is_correct: number | null; score: number; graded_by: string }[];

  const byP = new Map<number, typeof answers>();
  for (const a of answers) {
    if (!askedIds.has(a.question_id)) continue;
    const list = byP.get(a.participant_id) ?? [];
    list.push(a);
    byP.set(a.participant_id, list);
  }

  const participants = people
    .map((p) => {
      const mine = byP.get(p.id) ?? [];
      const correct = mine.filter((a) => a.is_correct === 1).length;
      const wrong = mine.filter((a) => a.is_correct === 0).length;
      const pending = mine.filter((a) => a.is_correct === null).length;
      const score = mine.reduce((s, a) => s + a.score, 0);
      return {
        id: p.id,
        name: p.display_name,
        trainee_number: p.trainee_number,
        answered: mine.length,
        correct,
        wrong,
        pending,
        unanswered: questions.length - mine.length,
        score,
        max_score: maxScore,
        percent: pct(score, maxScore),
        rank: 0,
      };
    })
    .sort((a, b) => b.score - a.score || b.correct - a.correct);
  participants.forEach((p, i) => {
    p.rank = i > 0 && participants[i - 1].score === p.score ? participants[i - 1].rank : i + 1;
  });

  const questionStats = questions.map((q) => {
    const qa = answers.filter((a) => a.question_id === q.id);
    const correct = qa.filter((a) => a.is_correct === 1).length;
    const wrong = qa.filter((a) => a.is_correct === 0).length;
    return {
      id: q.id,
      position: q.display_position,
      title: q.title || q.body.slice(0, 120),
      type: q.type,
      difficulty: q.difficulty,
      answered: qa.length,
      correct,
      wrong,
      pending: qa.length - correct - wrong,
      participation: pct(qa.length, people.length),
      wrong_rate: pct(wrong, qa.length),
      correct_text: describeCorrect(q, tf),
    };
  });

  // per-participant per-question answers for detailed export
  const matrix = participants.map((p) => ({
    participant: p,
    cells: questions.map((q) => {
      const a = answers.find((x) => x.participant_id === p.id && x.question_id === q.id);
      return a
        ? { answer_id: a.id, text: describeAnswer(q, JSON.parse(a.answer) as AnswerPayload, tf), is_correct: a.is_correct, score: a.score, graded_by: a.graded_by }
        : null;
    }),
  }));

  const totalAnswers = participants.reduce((s, p) => s + p.answered, 0);
  const summary = {
    participants: people.length,
    questions_asked: questions.length,
    max_score: maxScore,
    average_percent: participants.length ? Math.round((participants.reduce((s, p) => s + p.percent, 0) / participants.length) * 10) / 10 : 0,
    average_score: participants.length ? Math.round((participants.reduce((s, p) => s + p.score, 0) / participants.length) * 10) / 10 : 0,
    participation_rate: pct(totalAnswers, people.length * questions.length),
    pending_reviews: answers.filter((a) => a.is_correct === null && askedIds.has(a.question_id)).length,
  };

  return { activity, runs, run, questions, participants, summary, questionStats, matrix, generated_at: Date.now() };
}
export type ActivityReport = ReturnType<typeof activityReport>;

/** Course-level report: latest run of each activity, aggregated per trainee. */
export function courseReport(trainerId: number, courseId: number, tf?: TfLabels) {
  const course = getCourse(trainerId, courseId);
  const acts = db().prepare("SELECT id FROM activities WHERE course_id = ? ORDER BY created_at").all(courseId) as { id: number }[];
  const activityReports = acts.map((a) => activityReport(trainerId, a.id, undefined, tf));

  const trainees = new Map<string, { name: string; trainee_number: string | null; score: number; max: number; correct: number; wrong: number; activities: number }>();
  for (const r of activityReports) {
    if (!r.run) continue;
    for (const p of r.participants) {
      const key = p.trainee_number ? `#${p.trainee_number}` : `n:${p.name.trim().toLowerCase()}`;
      const t = trainees.get(key) ?? { name: p.name, trainee_number: p.trainee_number, score: 0, max: 0, correct: 0, wrong: 0, activities: 0 };
      t.score += p.score;
      t.max += p.max_score;
      t.correct += p.correct;
      t.wrong += p.wrong;
      t.activities += 1;
      trainees.set(key, t);
    }
  }
  const people = [...trainees.values()].map((t) => ({ ...t, percent: pct(t.score, t.max) })).sort((a, b) => b.percent - a.percent);
  const withRuns = activityReports.filter((r) => r.run && r.summary);
  return {
    generated_at: Date.now(),
    course,
    activities: activityReports.map((r) => ({
      id: r.activity.id,
      title: r.activity.title,
      run: r.run,
      runs: r.runs.length,
      summary: r.summary,
      hardest: [...r.questionStats].sort((a, b) => b.wrong_rate - a.wrong_rate)[0] ?? null,
    })),
    trainees: people,
    summary: {
      activities_run: withRuns.length,
      unique_trainees: people.length,
      average_percent: people.length ? Math.round((people.reduce((s, p) => s + p.percent, 0) / people.length) * 10) / 10 : 0,
      participation_rate: withRuns.length ? Math.round((withRuns.reduce((s, r) => s + (r.summary?.participation_rate ?? 0), 0) / withRuns.length) * 10) / 10 : 0,
    },
  };
}
export type CourseReport = ReturnType<typeof courseReport>;

/** Latest runs across all of a trainer's courses (dashboard + reports index). */
export function recentRuns(trainerId: number, limit = 8) {
  const rows = db()
    .prepare(
      `SELECT r.id AS run_id, r.number, r.started_at, r.ended_at, a.id AS activity_id, a.title AS activity_title, c.id AS course_id, c.title AS course_title
       FROM runs r JOIN activities a ON a.id = r.activity_id JOIN courses c ON c.id = a.course_id
       WHERE c.trainer_id = ? ORDER BY r.started_at DESC LIMIT ?`
    )
    .all(trainerId, limit) as { run_id: number; number: number; started_at: number; ended_at: number | null; activity_id: number; activity_title: string; course_id: number; course_title: string }[];
  return rows.map((r) => {
    const rep = activityReport(trainerId, r.activity_id, r.run_id);
    return { ...r, summary: rep.summary, hardest: [...rep.questionStats].sort((a, b) => b.wrong_rate - a.wrong_rate)[0] ?? null };
  });
}
