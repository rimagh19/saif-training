import "server-only";
import { db, now, tx } from "./db";
import { HttpError } from "./http";
import { createActivity, createQuestion, getActivity, getQuestion, touchCourse } from "./repo";
import { normalizeText, validateQuestion, type Question, type QuestionInput } from "./questions";

/*
 * Central question bank. Every query is scoped to the owning trainer.
 * Activities never point at bank rows directly: importing makes a linked COPY
 * (bank_id + bank_version), so editing a bank question never changes an activity,
 * and runs keep their own snapshots, so nothing changes past answers.
 */

export type BankMeta = { domain: string; specialty: string; topic: string; tags: string[] };
export type BankQuestion = QuestionInput &
  BankMeta & {
    id: number;
    status: "active" | "archived";
    version: number;
    created_at: number;
    updated_at: number;
    usage: number;
  };

type BankRow = Omit<BankQuestion, "options" | "correct" | "tags"> & { options: string; correct: string; tags: string | null };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function bankMetaInput(b: Record<string, unknown>): BankMeta {
  const raw = Array.isArray(b.tags) ? b.tags : typeof b.tags === "string" ? b.tags.split(/[,،\n]/) : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of raw) {
    const v = clean(t, 40).replace(/^#/, "");
    const key = v.toLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      tags.push(v);
    }
  }
  return { domain: clean(b.domain, 100), specialty: clean(b.specialty, 100), topic: clean(b.topic, 100), tags: tags.slice(0, 20) };
}

function searchText(q: QuestionInput, m: BankMeta) {
  return normalizeText(
    [q.title, q.body, q.explanation, ...q.options.map((o) => o.text), ...(q.type === "short" ? q.correct : []), m.domain, m.specialty, m.topic, ...m.tags].join(" ")
  );
}

function setTags(trainerId: number, questionId: number, tags: string[]) {
  db().prepare("DELETE FROM bank_question_tags WHERE question_id = ?").run(questionId);
  const ins = db().prepare("INSERT INTO bank_tags(trainer_id, name) VALUES (?, ?) ON CONFLICT(trainer_id, name) DO NOTHING");
  const get = db().prepare("SELECT id FROM bank_tags WHERE trainer_id = ? AND name = ?");
  const link = db().prepare("INSERT OR IGNORE INTO bank_question_tags(question_id, tag_id) VALUES (?, ?)");
  for (const t of tags) {
    ins.run(trainerId, t);
    link.run(questionId, (get.get(trainerId, t) as { id: number }).id);
  }
  // drop tags nobody uses any more
  db().prepare("DELETE FROM bank_tags WHERE trainer_id = ? AND id NOT IN (SELECT tag_id FROM bank_question_tags)").run(trainerId);
}

const SELECT = `SELECT b.*,
  (SELECT group_concat(t.name, char(31)) FROM bank_question_tags bt JOIN bank_tags t ON t.id = bt.tag_id WHERE bt.question_id = b.id) AS tags,
  (SELECT COUNT(*) FROM questions q WHERE q.bank_id = b.id AND q.deleted_at IS NULL) AS usage
  FROM bank_questions b`;

const parse = (r: BankRow): BankQuestion => ({
  ...r,
  options: JSON.parse(r.options),
  correct: JSON.parse(r.correct),
  tags: r.tags ? r.tags.split("\u001f").sort((a, b) => a.localeCompare(b)) : [],
});

export function getBankQuestion(trainerId: number, id: number): BankQuestion {
  const r = db().prepare(`${SELECT} WHERE b.id = ? AND b.trainer_id = ?`).get(id, trainerId) as BankRow | undefined;
  if (!r) throw new HttpError(404, "not_found");
  return parse(r);
}

export function createBankQuestion(trainerId: number, q: QuestionInput, m: BankMeta): number {
  return tx(() => {
    const t = now();
    const r = db()
      .prepare(
        `INSERT INTO bank_questions(trainer_id, type, title, body, image, options, correct, explanation, points, time_limit, difficulty, domain, specialty, topic, search_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(trainerId, q.type, q.title, q.body, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, q.points, q.time_limit, q.difficulty, m.domain, m.specialty, m.topic, searchText(q, m), t, t);
    const id = Number(r.lastInsertRowid);
    setTags(trainerId, id, m.tags);
    return id;
  });
}

const contentKey = (q: QuestionInput) => JSON.stringify([q.type, q.title, q.body, q.image, q.options, q.correct, q.explanation, q.points, q.time_limit, q.difficulty]);

/** Edits create a new version; activity copies keep the version they were imported with. */
export function updateBankQuestion(trainerId: number, id: number, q: QuestionInput, m: BankMeta) {
  const cur = getBankQuestion(trainerId, id);
  const changed = contentKey(cur) !== contentKey(q);
  tx(() => {
    db()
      .prepare(
        `UPDATE bank_questions SET type=?, title=?, body=?, image=?, options=?, correct=?, explanation=?, points=?, time_limit=?, difficulty=?,
         domain=?, specialty=?, topic=?, search_text=?, version = version + ?, updated_at=? WHERE id=? AND trainer_id=?`
      )
      .run(q.type, q.title, q.body, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, q.points, q.time_limit, q.difficulty,
        m.domain, m.specialty, m.topic, searchText(q, m), changed ? 1 : 0, now(), id, trainerId);
    setTags(trainerId, id, m.tags);
  });
}

export function setBankStatus(trainerId: number, ids: number[], status: "active" | "archived") {
  const st = db().prepare("UPDATE bank_questions SET status = ?, updated_at = ? WHERE id = ? AND trainer_id = ?");
  let n = 0;
  tx(() => ids.forEach((id) => (n += st.run(status, now(), id, trainerId).changes)));
  return n;
}

export function addTagToMany(trainerId: number, ids: number[], tag: string) {
  const t = bankMetaInput({ tags: [tag] }).tags[0];
  if (!t) throw new HttpError(400, "tag_required");
  tx(() => {
    for (const id of ids) {
      const q = getBankQuestion(trainerId, id);
      if (!q.tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
        setTags(trainerId, id, [...q.tags, t]);
        db().prepare("UPDATE bank_questions SET search_text = ? WHERE id = ?").run(searchText(q, { ...q, tags: [...q.tags, t] }), id);
      }
    }
  });
}

/** Deleting is only allowed for questions never used in an activity — otherwise archive. */
export function deleteBankQuestion(trainerId: number, id: number) {
  getBankQuestion(trainerId, id);
  const used = db().prepare("SELECT 1 FROM questions WHERE bank_id = ? LIMIT 1").get(id);
  if (used) throw new HttpError(409, "in_use_archive_instead");
  tx(() => {
    db().prepare("DELETE FROM bank_questions WHERE id = ? AND trainer_id = ?").run(id, trainerId);
    db().prepare("DELETE FROM bank_tags WHERE trainer_id = ? AND id NOT IN (SELECT tag_id FROM bank_question_tags)").run(trainerId);
  });
}

// ---------------- search ----------------

export type BankFilter = {
  q?: string;
  domain?: string;
  specialty?: string;
  topic?: string;
  tag?: string[];
  difficulty?: string;
  type?: string;
  status?: "active" | "archived" | "all";
  sort?: "recent" | "usage" | "title" | "oldest";
  limit?: number;
  offset?: number;
};

export function searchBank(trainerId: number, f: BankFilter) {
  const where = ["b.trainer_id = ?"];
  const args: unknown[] = [trainerId];
  const status = f.status ?? "active";
  if (status !== "all") {
    where.push("b.status = ?");
    args.push(status);
  }
  // keyword search: every word must appear (Arabic-normalised: hamza forms, ta marbuta, diacritics…)
  const terms = normalizeText(f.q ?? "").split(" ").filter(Boolean).slice(0, 8);
  for (const term of terms) {
    where.push("b.search_text LIKE ? ESCAPE '\\'");
    args.push(`%${term.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
  }
  for (const k of ["domain", "specialty", "topic", "difficulty", "type"] as const) {
    if (f[k]) {
      where.push(`b.${k} = ?`);
      args.push(f[k]);
    }
  }
  for (const tag of f.tag ?? []) {
    where.push("EXISTS (SELECT 1 FROM bank_question_tags bt JOIN bank_tags t ON t.id = bt.tag_id WHERE bt.question_id = b.id AND t.name = ?)");
    args.push(tag);
  }
  const order = { recent: "b.updated_at DESC", oldest: "b.created_at ASC", usage: "usage DESC, b.updated_at DESC", title: "b.title COLLATE NOCASE ASC" }[f.sort ?? "recent"];
  const whereSql = where.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) c FROM bank_questions b WHERE ${whereSql}`).get(...args) as { c: number }).c;
  const limit = Math.min(200, Math.max(1, f.limit ?? 50));
  const items = (db().prepare(`${SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, Math.max(0, f.offset ?? 0)) as BankRow[]).map(parse);
  return { items, total };
}

/** Values for filters and autocomplete, with counts (within active/archived scope). */
export function bankFacets(trainerId: number, status: "active" | "archived" | "all" = "active") {
  const st = status === "all" ? "" : "AND b.status = ?";
  const args = status === "all" ? [trainerId] : [trainerId, status];
  const col = (c: string) =>
    db()
      .prepare(`SELECT ${c} AS value, COUNT(*) AS count FROM bank_questions b WHERE b.trainer_id = ? ${st} AND ${c} != '' GROUP BY ${c} ORDER BY count DESC, value`)
      .all(...args) as { value: string; count: number }[];
  const tags = db()
    .prepare(
      `SELECT t.name AS value, COUNT(*) AS count FROM bank_tags t JOIN bank_question_tags bt ON bt.tag_id = t.id JOIN bank_questions b ON b.id = bt.question_id
       WHERE t.trainer_id = ? ${st} GROUP BY t.id ORDER BY count DESC, value`
    )
    .all(...args) as { value: string; count: number }[];
  const counts = db()
    .prepare("SELECT status, COUNT(*) c FROM bank_questions WHERE trainer_id = ? GROUP BY status")
    .all(trainerId) as { status: string; c: number }[];
  return {
    domains: col("domain"),
    specialties: col("specialty"),
    topics: col("topic"),
    tags,
    counts: { active: counts.find((c) => c.status === "active")?.c ?? 0, archived: counts.find((c) => c.status === "archived")?.c ?? 0 },
  };
}
export type BankFacets = ReturnType<typeof bankFacets>;

/** Where a bank question is used (activity copies), for the detail page. */
export function bankUsage(trainerId: number, id: number) {
  getBankQuestion(trainerId, id);
  return db()
    .prepare(
      `SELECT q.id AS question_id, q.bank_version, a.id AS activity_id, a.title AS activity_title, c.id AS course_id, c.title AS course_title,
        (SELECT COUNT(*) FROM answers ans WHERE ans.question_id = q.id) AS answers
       FROM questions q JOIN activities a ON a.id = q.activity_id JOIN courses c ON c.id = a.course_id
       WHERE q.bank_id = ? AND q.deleted_at IS NULL AND c.trainer_id = ? ORDER BY c.updated_at DESC`
    )
    .all(id, trainerId) as { question_id: number; bank_version: number; activity_id: number; activity_title: string; course_id: number; course_title: string; answers: number }[];
}

// ---------------- moving questions between bank and activities ----------------

const asInput = (q: BankQuestion | Question): QuestionInput => ({
  type: q.type,
  title: q.title,
  body: q.body,
  image: q.image,
  options: q.options,
  correct: q.correct,
  explanation: q.explanation,
  points: q.points,
  time_limit: q.time_limit,
  difficulty: q.difficulty,
});

/** Imports bank questions (as linked copies) into an existing activity or a new one. */
export function importToActivity(trainerId: number, ids: number[], target: { activityId?: number; newActivity?: { courseId: number; title: string } }) {
  if (ids.length === 0 || ids.length > 200) throw new HttpError(400, "select_questions");
  const qs = ids.map((id) => getBankQuestion(trainerId, id));
  if (qs.some((q) => q.status === "archived")) throw new HttpError(409, "archived_question");
  return tx(() => {
    const activityId = target.activityId
      ? getActivity(trainerId, target.activityId).id
      : target.newActivity
        ? createActivity(trainerId, target.newActivity.courseId, { title: target.newActivity.title })
        : (() => {
            throw new HttpError(400, "target_required");
          })();
    const created = qs.map((q) => createQuestion(trainerId, activityId, asInput(q), { bank_id: q.id, bank_version: q.version }));
    return { activityId, created };
  });
}

/** Saves an activity question into the bank and links the activity copy to it. */
export function saveQuestionToBank(trainerId: number, questionId: number, m: BankMeta) {
  const q = getQuestion(trainerId, questionId);
  if (q.bank_id) {
    const exists = db().prepare("SELECT 1 FROM bank_questions WHERE id = ? AND trainer_id = ?").get(q.bank_id, trainerId);
    if (exists) throw new HttpError(409, "already_in_bank");
  }
  const v = validateQuestion(asInput(q) as unknown as Record<string, unknown>);
  if (!v.ok) throw new HttpError(400, v.error);
  return tx(() => {
    const id = createBankQuestion(trainerId, v.value, m);
    db().prepare("UPDATE questions SET bank_id = ?, bank_version = 1 WHERE id = ?").run(id, questionId);
    touchCourse(q.course_id);
    return id;
  });
}

/** Updates an activity copy to the latest bank version (past runs keep their snapshots). */
export function syncFromBank(trainerId: number, questionId: number) {
  const q = getQuestion(trainerId, questionId);
  if (!q.bank_id) throw new HttpError(400, "not_linked");
  const b = getBankQuestion(trainerId, q.bank_id);
  const i = asInput(b);
  db()
    .prepare(
      `UPDATE questions SET type=?, title=?, body=?, image=?, options=?, correct=?, explanation=?, points=?, time_limit=?, difficulty=?, bank_version=?, updated_at=? WHERE id=?`
    )
    .run(i.type, i.title, i.body, i.image, JSON.stringify(i.options), JSON.stringify(i.correct), i.explanation, i.points, i.time_limit, i.difficulty, b.version, now(), questionId);
  touchCourse(q.course_id);
  return { version: b.version };
}

/** Latest bank versions for linked activity questions (to flag "update available"). */
export function bankVersions(trainerId: number, bankIds: number[]) {
  if (bankIds.length === 0) return {} as Record<number, { version: number; status: string }>;
  const rows = db()
    .prepare(`SELECT id, version, status FROM bank_questions WHERE trainer_id = ? AND id IN (${bankIds.map(() => "?").join(",")})`)
    .all(trainerId, ...bankIds) as { id: number; version: number; status: string }[];
  return Object.fromEntries(rows.map((r) => [r.id, { version: r.version, status: r.status }]));
}
