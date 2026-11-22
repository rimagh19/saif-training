import "server-only";
import crypto from "node:crypto";
import { db, now, tx } from "./db";
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

export function listCourses(trainerId: number, opts: { status?: string; q?: string } = {}) {
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
  return db()
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM activities a WHERE a.course_id = c.id) AS activity_count,
        (SELECT COUNT(*) FROM questions q JOIN activities a ON a.id = q.activity_id WHERE a.course_id = c.id AND q.deleted_at IS NULL) AS question_count,
        (SELECT COUNT(*) FROM participants p JOIN runs r ON r.id = p.run_id JOIN activities a ON a.id = r.activity_id WHERE a.course_id = c.id) AS participant_count
       FROM courses c WHERE ${where.join(" AND ")} ORDER BY c.updated_at DESC`
    )
    .all(...args) as (Course & { activity_count: number; question_count: number; participant_count: number })[];
}

export function getCourse(trainerId: number, id: number): Course {
  const c = db().prepare("SELECT * FROM courses WHERE id = ? AND trainer_id = ?").get(id, trainerId) as Course | undefined;
  if (!c) throw new HttpError(404, "not_found");
  return c;
}

export function createCourse(trainerId: number, data: Partial<Course>): number {
  const t = now();
  const r = db()
    .prepare(
      `INSERT INTO courses(trainer_id, title, description, trainer_name, course_date, mode, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(trainerId, data.title, data.description ?? "", data.trainer_name ?? "", data.course_date ?? null, data.mode ?? "onsite", data.status ?? "draft", t, t);
  return Number(r.lastInsertRowid);
}

export function updateCourse(trainerId: number, id: number, data: Partial<Course>) {
  const c = getCourse(trainerId, id);
  const m = { ...c, ...data };
  db()
    .prepare(
      `UPDATE courses SET title=?, description=?, trainer_name=?, course_date=?, mode=?, status=?, updated_at=? WHERE id=? AND trainer_id=?`
    )
    .run(m.title, m.description, m.trainer_name, m.course_date, m.mode, m.status, now(), id, trainerId);
}

export function deleteCourse(trainerId: number, id: number) {
  getCourse(trainerId, id);
  db().prepare("DELETE FROM courses WHERE id = ? AND trainer_id = ?").run(id, trainerId);
}

export const touchCourse = (courseId: number) => db().prepare("UPDATE courses SET updated_at = ? WHERE id = ?").run(now(), courseId);

// ---------------- Activities ----------------

function newJoinCode(): string {
  for (let i = 0; i < 50; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!db().prepare("SELECT 1 FROM activities WHERE join_code = ?").get(code)) return code;
  }
  throw new HttpError(500, "code_generation_failed");
}

export type ActivityWithCourse = Activity & { course_title: string; course_mode: CourseMode; course_status: CourseStatus };

export function getActivity(trainerId: number, id: number): ActivityWithCourse {
  const a = db()
    .prepare(
      `SELECT a.*, c.title AS course_title, c.mode AS course_mode, c.status AS course_status
       FROM activities a JOIN courses c ON c.id = a.course_id WHERE a.id = ? AND c.trainer_id = ?`
    )
    .get(id, trainerId) as ActivityWithCourse | undefined;
  if (!a) throw new HttpError(404, "not_found");
  return a;
}

export function listActivities(trainerId: number, opts: { courseId?: number; status?: string } = {}) {
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
  return db()
    .prepare(
      `SELECT a.*, c.title AS course_title, c.mode AS course_mode, c.status AS course_status,
        (SELECT COUNT(*) FROM questions q WHERE q.activity_id = a.id AND q.deleted_at IS NULL) AS question_count,
        (SELECT COUNT(*) FROM runs r WHERE r.activity_id = a.id) AS run_count,
        (SELECT COUNT(*) FROM participants p JOIN runs r ON r.id = p.run_id WHERE r.activity_id = a.id) AS participant_count
       FROM activities a JOIN courses c ON c.id = a.course_id
       WHERE ${where.join(" AND ")} ORDER BY a.updated_at DESC`
    )
    .all(...args) as (ActivityWithCourse & { question_count: number; run_count: number; participant_count: number })[];
}

export function createActivity(trainerId: number, courseId: number, data: { title: string; description?: string }): number {
  getCourse(trainerId, courseId);
  const t = now();
  const r = db()
    .prepare(`INSERT INTO activities(course_id, title, description, join_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(courseId, data.title, data.description ?? "", newJoinCode(), t, t);
  touchCourse(courseId);
  return Number(r.lastInsertRowid);
}

export function updateActivity(
  trainerId: number,
  id: number,
  data: Partial<Pick<Activity, "title" | "description" | "identity_mode" | "allow_late_edit" | "allow_change" | "reveal_to_trainees" | "show_leaderboard">>
) {
  const a = getActivity(trainerId, id);
  const m = { ...a, ...data };
  db()
    .prepare(
      `UPDATE activities SET title=?, description=?, identity_mode=?, allow_late_edit=?, allow_change=?, reveal_to_trainees=?, show_leaderboard=?, updated_at=? WHERE id=?`
    )
    .run(m.title, m.description, m.identity_mode, m.allow_late_edit ? 1 : 0, m.allow_change ? 1 : 0, m.reveal_to_trainees ? 1 : 0, m.show_leaderboard ? 1 : 0, now(), id);
  touchCourse(a.course_id);
}

export function regenerateJoinCode(trainerId: number, id: number) {
  getActivity(trainerId, id);
  db().prepare("UPDATE activities SET join_code = ?, updated_at = ? WHERE id = ?").run(newJoinCode(), now(), id);
}

export function deleteActivity(trainerId: number, id: number) {
  const a = getActivity(trainerId, id);
  db().prepare("DELETE FROM activities WHERE id = ?").run(id);
  touchCourse(a.course_id);
}

// ---------------- Questions ----------------

export function listQuestions(activityId: number): Question[] {
  return (db().prepare("SELECT * FROM questions WHERE activity_id = ? AND deleted_at IS NULL ORDER BY position, id").all(activityId) as QuestionRow[]).map(parseQuestion);
}

export function getQuestion(trainerId: number, id: number): Question & { course_id: number } {
  const r = db()
    .prepare(
      `SELECT q.*, a.course_id FROM questions q JOIN activities a ON a.id = q.activity_id JOIN courses c ON c.id = a.course_id
       WHERE q.id = ? AND c.trainer_id = ? AND q.deleted_at IS NULL`
    )
    .get(id, trainerId) as (QuestionRow & { course_id: number }) | undefined;
  if (!r) throw new HttpError(404, "not_found");
  return { ...parseQuestion(r), course_id: r.course_id };
}

export function createQuestion(trainerId: number, activityId: number, q: QuestionInput, link?: { bank_id: number; bank_version: number }): number {
  const a = getActivity(trainerId, activityId);
  const t = now();
  const pos = (db().prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM questions WHERE activity_id = ?").get(activityId) as { p: number }).p;
  const r = db()
    .prepare(
      `INSERT INTO questions(activity_id, position, type, title, body, image, options, correct, explanation, points, time_limit, difficulty, bank_id, bank_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(activityId, pos, q.type, q.title, q.body, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, q.points, q.time_limit, q.difficulty, link?.bank_id ?? null, link?.bank_version ?? null, t, t);
  db().prepare("UPDATE activities SET updated_at = ? WHERE id = ?").run(t, activityId);
  touchCourse(a.course_id);
  return Number(r.lastInsertRowid);
}

export function updateQuestion(trainerId: number, id: number, q: QuestionInput) {
  const existing = getQuestion(trainerId, id);
  db()
    .prepare(
      `UPDATE questions SET type=?, title=?, body=?, image=?, options=?, correct=?, explanation=?, points=?, time_limit=?, difficulty=?, updated_at=? WHERE id=?`
    )
    .run(q.type, q.title, q.body, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, q.points, q.time_limit, q.difficulty, now(), id);
  touchCourse(existing.course_id);
}

export function deleteQuestion(trainerId: number, id: number) {
  const q = getQuestion(trainerId, id);
  tx(() => {
    db().prepare("UPDATE activities SET current_question_id = NULL, q_state = 'idle' WHERE current_question_id = ?").run(id);
    // Questions that were already asked are only hidden, so their answers and reports stay intact.
    const asked = db().prepare("SELECT 1 FROM run_questions WHERE question_id = ? LIMIT 1").get(id);
    if (asked) db().prepare("UPDATE questions SET deleted_at = ? WHERE id = ?").run(now(), id);
    else db().prepare("DELETE FROM questions WHERE id = ?").run(id);
  });
  touchCourse(q.course_id);
}

export function reorderQuestions(trainerId: number, activityId: number, ids: number[]) {
  getActivity(trainerId, activityId);
  const existing = new Set(listQuestions(activityId).map((q) => q.id));
  if (ids.length !== existing.size || ids.some((i) => !existing.has(i))) throw new HttpError(400, "invalid_order");
  tx(() => {
    const st = db().prepare("UPDATE questions SET position = ? WHERE id = ? AND activity_id = ?");
    ids.forEach((qid, i) => st.run(i + 1, qid, activityId));
  });
}

export function copyQuestion(trainerId: number, questionId: number, targetActivityId: number): number {
  const q = getQuestion(trainerId, questionId);
  return createQuestion(trainerId, targetActivityId, q, q.bank_id && q.bank_version ? { bank_id: q.bank_id, bank_version: q.bank_version } : undefined);
}

// ---------------- Dashboard ----------------

export function dashboardStats(trainerId: number) {
  const one = (sql: string) => (db().prepare(sql).get(trainerId) as { c: number }).c;
  return {
    courses: one("SELECT COUNT(*) c FROM courses WHERE trainer_id = ?"),
    activities: one("SELECT COUNT(*) c FROM activities a JOIN courses c2 ON c2.id = a.course_id WHERE c2.trainer_id = ?"),
    questions: one("SELECT COUNT(*) c FROM questions q JOIN activities a ON a.id = q.activity_id JOIN courses c2 ON c2.id = a.course_id WHERE c2.trainer_id = ? AND q.deleted_at IS NULL"),
    participants: one(
      "SELECT COUNT(*) c FROM participants p JOIN runs r ON r.id = p.run_id JOIN activities a ON a.id = r.activity_id JOIN courses c2 ON c2.id = a.course_id WHERE c2.trainer_id = ?"
    ),
  };
}

/** Courses (not archived) with their activities — targets for importing/copying questions. */
export function coursesWithActivities(trainerId: number) {
  const acts = listActivities(trainerId);
  return listCourses(trainerId).map((c) => ({
    id: c.id,
    title: c.title,
    activities: acts.filter((a) => a.course_id === c.id).map((a) => ({ id: a.id, title: a.title, status: a.status })),
  }));
}
