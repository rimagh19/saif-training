import "server-only";
import crypto from "node:crypto";
import { all, get, now, run, tx } from "./db";
import { HttpError } from "./http";
import type { Question, QuestionInput } from "./questions";

/*
 * Every trainer-facing query is scoped by trainer_id: a trainer can never read
 * or change another trainer's courses, activities, questions or results.
 */

export type CourseMode = "onsite" | "remote";
export type CourseStatus = "draft" | "active" | "completed" | "archived";

export type Course = {
  id: number;
  trainer_id: number;
  title: string;
  description: string;
  trainer_name: string;
  course_date: string | null;
  mode: CourseMode;
  status: CourseStatus;
  created_at: number;
  updated_at: number;
};

export type Activity = {
  id: number;
  course_id: number;
  title: string;
  description: string;
  join_code: string;
  status: "draft" | "live" | "ended";
  identity_mode: "name" | "name_id";
  allow_late_edit: number;
  allow_change: number;
  reveal_to_trainees: number;
  show_leaderboard: number;
  current_run_id: number | null;
  current_question_id: number | null;
  q_state: "idle" | "open" | "closed" | "revealed";
  q_opened_at: number | null;
  q_deadline: number | null;
  q_show_dist: number;
  rev: number;
  created_at: number;
  updated_at: number;
};

type QuestionRow = Omit<Question, "options" | "correct"> & { options: string; correct: string };

export const parseQuestion = (r: QuestionRow): Question => ({
  ...r,
  options: JSON.parse(r.options),
  correct: JSON.parse(r.correct),
});

// ---------------- Courses ----------------

export async function listCourses(trainerId: number, opts: { status?: string; q?: string } = {}) {
  const where = ["c.trainer_id = ?"];
  const args: unknown[] = [trainerId];
  if (opts.status && opts.status !== "all") {
    where.push("c.status = ?");
    args.push(opts.status);
  } else if (!opts.status) {
    where.push("c.status != 'archived'");
  }
  if (opts.q) {
    where.push("(c.title LIKE ? OR c.description LIKE ?)");
    args.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  return await all(`SELECT c.*,
        (SELECT COUNT(*) FROM activities a WHERE a.course_id = c.id) AS activity_count,
        (SELECT COUNT(*) FROM questions q JOIN activities a ON a.id = q.activity_id WHERE a.course_id = c.id AND q.deleted_at IS NULL) AS question_count,
        (SELECT COUNT(*) FROM participants p JOIN runs r ON r.id = p.run_id JOIN activities a ON a.id = r.activity_id WHERE a.course_id = c.id) AS participant_count
       FROM courses c WHERE ${where.join(" AND ")} ORDER BY c.updated_at DESC`, ...args) as (Course & { activity_count: number; question_count: number; participant_count: number })[];
}

export async function getCourse(trainerId: number, id: number): Promise<Course> {
  const c = await get("SELECT * FROM courses WHERE id = ? AND trainer_id = ?", id, trainerId) as Course | undefined;
  if (!c) throw new HttpError(404, "not_found");
  return c;
}

export async function createCourse(trainerId: number, data: Partial<Course>): Promise<number> {
  const t = now();
  const r = await run(`INSERT INTO courses(trainer_id, title, description, trainer_name, course_date, mode, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, trainerId, data.title, data.description ?? "", data.trainer_name ?? "", data.course_date ?? null, data.mode ?? "onsite", data.status ?? "draft", t, t);
  return r.lastId;
}

export async function updateCourse(trainerId: number, id: number, data: Partial<Course>) {
  const c = await getCourse(trainerId, id);
  const m = { ...c, ...data };
  await run(`UPDATE courses SET title=?, description=?, trainer_name=?, course_date=?, mode=?, status=?, updated_at=? WHERE id=? AND trainer_id=?`, m.title, m.description, m.trainer_name, m.course_date, m.mode, m.status, now(), id, trainerId);
}

export async function deleteCourse(trainerId: number, id: number) {
  await getCourse(trainerId, id);
  await run("DELETE FROM courses WHERE id = ? AND trainer_id = ?", id, trainerId);
}

export const touchCourse = async (courseId: number) => await run("UPDATE courses SET updated_at = ? WHERE id = ?", now(), courseId);

// ---------------- Activities ----------------

async function newJoinCode(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!await get("SELECT 1 FROM activities WHERE join_code = ?", code)) return code;
  }
  throw new HttpError(500, "code_generation_failed");
}

export type ActivityWithCourse = Activity & { course_title: string; course_mode: CourseMode; course_status: CourseStatus };

export async function getActivity(trainerId: number, id: number): Promise<ActivityWithCourse> {
  const a = await get(`SELECT a.*, c.title AS course_title, c.mode AS course_mode, c.status AS course_status
       FROM activities a JOIN courses c ON c.id = a.course_id WHERE a.id = ? AND c.trainer_id = ?`, id, trainerId) as ActivityWithCourse | undefined;
  if (!a) throw new HttpError(404, "not_found");
  return a;
}

export async function listActivities(trainerId: number, opts: { courseId?: number; status?: string } = {}) {
  const where = ["c.trainer_id = ?"];
  const args: unknown[] = [trainerId];
  if (opts.courseId) {
    where.push("a.course_id = ?");
    args.push(opts.courseId);
  }
  if (opts.status && opts.status !== "all") {
    where.push("a.status = ?");
    args.push(opts.status);
  }
  return await all(`SELECT a.*, c.title AS course_title, c.mode AS course_mode, c.status AS course_status,
        (SELECT COUNT(*) FROM questions q WHERE q.activity_id = a.id AND q.deleted_at IS NULL) AS question_count,
        (SELECT COUNT(*) FROM runs r WHERE r.activity_id = a.id) AS run_count,
        (SELECT COUNT(*) FROM participants p JOIN runs r ON r.id = p.run_id WHERE r.activity_id = a.id) AS participant_count
       FROM activities a JOIN courses c ON c.id = a.course_id
       WHERE ${where.join(" AND ")} ORDER BY a.updated_at DESC`, ...args) as (ActivityWithCourse & { question_count: number; run_count: number; participant_count: number })[];
}

export async function createActivity(trainerId: number, courseId: number, data: { title: string; description?: string }): Promise<number> {
  await getCourse(trainerId, courseId);
  const t = now();
  const r = await run(`INSERT INTO activities(course_id, title, description, join_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, courseId, data.title, data.description ?? "", await newJoinCode(), t, t);
  await touchCourse(courseId);
  return r.lastId;
}

export async function updateActivity(
  trainerId: number,
  id: number,
  data: Partial<Pick<Activity, "title" | "description" | "identity_mode" | "allow_late_edit" | "allow_change" | "reveal_to_trainees" | "show_leaderboard">>
) {
  const a = await getActivity(trainerId, id);
  const m = { ...a, ...data };
  await run(`UPDATE activities SET title=?, description=?, identity_mode=?, allow_late_edit=?, allow_change=?, reveal_to_trainees=?, show_leaderboard=?, updated_at=? WHERE id=?`, m.title, m.description, m.identity_mode, m.allow_late_edit ? 1 : 0, m.allow_change ? 1 : 0, m.reveal_to_trainees ? 1 : 0, m.show_leaderboard ? 1 : 0, now(), id);
  await touchCourse(a.course_id);
}

export async function regenerateJoinCode(trainerId: number, id: number) {
  await getActivity(trainerId, id);
  await run("UPDATE activities SET join_code = ?, updated_at = ? WHERE id = ?", await newJoinCode(), now(), id);
}

export async function deleteActivity(trainerId: number, id: number) {
  const a = await getActivity(trainerId, id);
  await run("DELETE FROM activities WHERE id = ?", id);
  await touchCourse(a.course_id);
}

// ---------------- Questions ----------------

export async function listQuestions(activityId: number): Promise<Question[]> {
  return (await all("SELECT * FROM questions WHERE activity_id = ? AND deleted_at IS NULL ORDER BY position, id", activityId) as QuestionRow[]).map(parseQuestion);
}

export async function getQuestion(trainerId: number, id: number): Promise<Question & { course_id: number }> {
  const r = await get(`SELECT q.*, a.course_id FROM questions q JOIN activities a ON a.id = q.activity_id JOIN courses c ON c.id = a.course_id
       WHERE q.id = ? AND c.trainer_id = ? AND q.deleted_at IS NULL`, id, trainerId) as (QuestionRow & { course_id: number }) | undefined;
  if (!r) throw new HttpError(404, "not_found");
  return { ...parseQuestion(r), course_id: r.course_id };
}

export async function createQuestion(trainerId: number, activityId: number, q: QuestionInput, link?: { bank_id: number; bank_version: number }): Promise<number> {
  const a = await getActivity(trainerId, activityId);
  const t = now();
  const pos = (await get("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM questions WHERE activity_id = ?", activityId) as { p: number }).p;
  const r = await run(`INSERT INTO questions(activity_id, position, type, title, body, image, options, correct, explanation, points, time_limit, difficulty, bank_id, bank_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, activityId, pos, q.type, q.title, q.body, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, q.points, q.time_limit, q.difficulty, link?.bank_id ?? null, link?.bank_version ?? null, t, t);
  await run("UPDATE activities SET updated_at = ? WHERE id = ?", t, activityId);
  await touchCourse(a.course_id);
  return r.lastId;
}

export async function updateQuestion(trainerId: number, id: number, q: QuestionInput) {
  const existing = await getQuestion(trainerId, id);
  await run(`UPDATE questions SET type=?, title=?, body=?, image=?, options=?, correct=?, explanation=?, points=?, time_limit=?, difficulty=?, updated_at=? WHERE id=?`, q.type, q.title, q.body, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, q.points, q.time_limit, q.difficulty, now(), id);
  await touchCourse(existing.course_id);
}

export async function deleteQuestion(trainerId: number, id: number) {
  const q = await getQuestion(trainerId, id);
  await tx(async () => {
        await run("UPDATE activities SET current_question_id = NULL, q_state = 'idle' WHERE current_question_id = ?", id);
        // Questions that were already asked are only hidden, so their answers and reports stay intact.
        const asked = await get("SELECT 1 FROM run_questions WHERE question_id = ? LIMIT 1", id);
        if (asked) await run("UPDATE questions SET deleted_at = ? WHERE id = ?", now(), id);
        else await run("DELETE FROM questions WHERE id = ?", id);
      });
  await touchCourse(q.course_id);
}

export async function reorderQuestions(trainerId: number, activityId: number, ids: number[]) {
  await getActivity(trainerId, activityId);
  const existing = new Set((await listQuestions(activityId)).map((q) => q.id));
  if (ids.length !== existing.size || ids.some((i) => !existing.has(i))) throw new HttpError(400, "invalid_order");
  await tx(async () => {
        for (const [i, qid] of ids.entries()) await run("UPDATE questions SET position = ? WHERE id = ? AND activity_id = ?", i + 1, qid, activityId);
      });
}

export async function copyQuestion(trainerId: number, questionId: number, targetActivityId: number): Promise<number> {
  const q = await getQuestion(trainerId, questionId);
  return await createQuestion(trainerId, targetActivityId, q, q.bank_id && q.bank_version ? { bank_id: q.bank_id, bank_version: q.bank_version } : undefined);
}

// ---------------- Dashboard ----------------

export async function dashboardStats(trainerId: number) {
  const one = async (sql: string) => (await get<{ c: number }>(sql, trainerId))!.c;
  return {
    courses: await one("SELECT COUNT(*) c FROM courses WHERE trainer_id = ?"),
    activities: await one("SELECT COUNT(*) c FROM activities a JOIN courses c2 ON c2.id = a.course_id WHERE c2.trainer_id = ?"),
    questions: await one("SELECT COUNT(*) c FROM questions q JOIN activities a ON a.id = q.activity_id JOIN courses c2 ON c2.id = a.course_id WHERE c2.trainer_id = ? AND q.deleted_at IS NULL"),
    participants: await one(
      "SELECT COUNT(*) c FROM participants p JOIN runs r ON r.id = p.run_id JOIN activities a ON a.id = r.activity_id JOIN courses c2 ON c2.id = a.course_id WHERE c2.trainer_id = ?"
    ),
  };
}

/** Courses (not archived) with their activities — targets for importing/copying questions. */
export async function coursesWithActivities(trainerId: number) {
  const acts = await listActivities(trainerId);
  return (await listCourses(trainerId)).map((c) => ({
    id: c.id,
    title: c.title,
    activities: acts.filter((a) => a.course_id === c.id).map((a) => ({ id: a.id, title: a.title, status: a.status })),
  }));
}
