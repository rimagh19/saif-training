import "server-only";
import { all, get, now, run, tx } from "./db";
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

async function setTags(trainerId: number, questionId: number, tags: string[]) {
  await run("DELETE FROM bank_question_tags WHERE question_id = ?", questionId);
  for (const t of tags) {
    await run("INSERT INTO bank_tags(trainer_id, name) VALUES (?, ?) ON CONFLICT(trainer_id, name) DO NOTHING", trainerId, t);
    const tag = (await get<{ id: number }>("SELECT id FROM bank_tags WHERE trainer_id = ? AND name = ?", trainerId, t))!;
    await run("INSERT OR IGNORE INTO bank_question_tags(question_id, tag_id) VALUES (?, ?)", questionId, tag.id);
  }
  // drop tags nobody uses any more
  await run("DELETE FROM bank_tags WHERE trainer_id = ? AND id NOT IN (SELECT tag_id FROM bank_question_tags)", trainerId);
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

export async function getBankQuestion(trainerId: number, id: number): Promise<BankQuestion> {
  const r = await get(`${SELECT} WHERE b.id = ? AND b.trainer_id = ?`, id, trainerId) as BankRow | undefined;
  if (!r) throw new HttpError(404, "not_found");
  return parse(r);
}

export async function createBankQuestion(trainerId: number, q: QuestionInput, m: BankMeta): Promise<number> {
  return await tx(async () => {
      const t = now();
      const r = await run(`INSERT INTO bank_questions(trainer_id, type, title, body, image, options, correct, explanation, points, time_limit, difficulty, domain, specialty, topic, search_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, trainerId, q.type, q.title, q.body, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, q.points, q.time_limit, q.difficulty, m.domain, m.specialty, m.topic, searchText(q, m), t, t);
      const id = r.lastId;
      await setTags(trainerId, id, m.tags);
      return id;
    });
}

const contentKey = (q: QuestionInput) => JSON.stringify([q.type, q.title, q.body, q.image, q.options, q.correct, q.explanation, q.points, q.time_limit, q.difficulty]);

/** Edits create a new version; activity copies keep the version they were imported with. */
export async function updateBankQuestion(trainerId: number, id: number, q: QuestionInput, m: BankMeta) {
  const cur = await getBankQuestion(trainerId, id);
  const changed = contentKey(cur) !== contentKey(q);
  await tx(async () => {
        await run(`UPDATE bank_questions SET type=?, title=?, body=?, image=?, options=?, correct=?, explanation=?, points=?, time_limit=?, difficulty=?,
         domain=?, specialty=?, topic=?, search_text=?, version = version + ?, updated_at=? WHERE id=? AND trainer_id=?`, q.type, q.title, q.body, q.image, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, q.points, q.time_limit, q.difficulty,
            m.domain, m.specialty, m.topic, searchText(q, m), changed ? 1 : 0, now(), id, trainerId);
        await setTags(trainerId, id, m.tags);
      });
}

export async function setBankStatus(trainerId: number, ids: number[], status: "active" | "archived") {
  let n = 0;
  await tx(async () => {
    for (const id of ids) n += (await run("UPDATE bank_questions SET status = ?, updated_at = ? WHERE id = ? AND trainer_id = ?", status, now(), id, trainerId)).changes;
  });
  return n;
}

export async function addTagToMany(trainerId: number, ids: number[], tag: string) {
  const t = bankMetaInput({ tags: [tag] }).tags[0];
  if (!t) throw new HttpError(400, "tag_required");
  await tx(async () => {
        for (const id of ids) {
          const q = await getBankQuestion(trainerId, id);
          if (!q.tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
            await setTags(trainerId, id, [...q.tags, t]);
            await run("UPDATE bank_questions SET search_text = ? WHERE id = ?", searchText(q, { ...q, tags: [...q.tags, t] }), id);
          }
        }
      });
}

/** Deleting is only allowed for questions never used in an activity — otherwise archive. */
export async function deleteBankQuestion(trainerId: number, id: number) {
  await getBankQuestion(trainerId, id);
  const used = await get("SELECT 1 FROM questions WHERE bank_id = ? LIMIT 1", id);
  if (used) throw new HttpError(409, "in_use_archive_instead");
  await tx(async () => {
        await run("DELETE FROM bank_questions WHERE id = ? AND trainer_id = ?", id, trainerId);
        await run("DELETE FROM bank_tags WHERE trainer_id = ? AND id NOT IN (SELECT tag_id FROM bank_question_tags)", trainerId);
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

export async function searchBank(trainerId: number, f: BankFilter) {
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
  const total = (await get(`SELECT COUNT(*) c FROM bank_questions b WHERE ${whereSql}`, ...args) as { c: number }).c;
  const limit = Math.min(200, Math.max(1, f.limit ?? 50));
  const items = (await all(`${SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, Math.max(0, f.offset ?? 0)) as BankRow[]).map(parse);
  return { items, total };
}

/** Values for filters and autocomplete, with counts (within active/archived scope). */
export async function bankFacets(trainerId: number, status: "active" | "archived" | "all" = "active") {
  const st = status === "all" ? "" : "AND b.status = ?";
  const args = status === "all" ? [trainerId] : [trainerId, status];
  const col = async (c: string) =>
    await all(`SELECT ${c} AS value, COUNT(*) AS count FROM bank_questions b WHERE b.trainer_id = ? ${st} AND ${c} != '' GROUP BY ${c} ORDER BY count DESC, value`, ...args) as { value: string; count: number }[];
  const tags = await all(`SELECT t.name AS value, COUNT(*) AS count FROM bank_tags t JOIN bank_question_tags bt ON bt.tag_id = t.id JOIN bank_questions b ON b.id = bt.question_id
       WHERE t.trainer_id = ? ${st} GROUP BY t.id ORDER BY count DESC, value`, ...args) as { value: string; count: number }[];
  const counts = await all("SELECT status, COUNT(*) c FROM bank_questions WHERE trainer_id = ? GROUP BY status", trainerId) as { status: string; c: number }[];
  return {
    domains: await col("domain"),
    specialties: await col("specialty"),
    topics: await col("topic"),
    tags,
    counts: { active: counts.find((c) => c.status === "active")?.c ?? 0, archived: counts.find((c) => c.status === "archived")?.c ?? 0 },
  };
}
export type BankFacets = Awaited<ReturnType<typeof bankFacets>>;

/** Where a bank question is used (activity copies), for the detail page. */
export async function bankUsage(trainerId: number, id: number) {
  await getBankQuestion(trainerId, id);
  return await all(`SELECT q.id AS question_id, q.bank_version, a.id AS activity_id, a.title AS activity_title, c.id AS course_id, c.title AS course_title,
        (SELECT COUNT(*) FROM answers ans WHERE ans.question_id = q.id) AS answers
       FROM questions q JOIN activities a ON a.id = q.activity_id JOIN courses c ON c.id = a.course_id
       WHERE q.bank_id = ? AND q.deleted_at IS NULL AND c.trainer_id = ? ORDER BY c.updated_at DESC`, id, trainerId) as { question_id: number; bank_version: number; activity_id: number; activity_title: string; course_id: number; course_title: string; answers: number }[];
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
export async function importToActivity(trainerId: number, ids: number[], target: { activityId?: number; newActivity?: { courseId: number; title: string } }) {
  if (ids.length === 0 || ids.length > 200) throw new HttpError(400, "select_questions");
  const qs: BankQuestion[] = [];
  for (const id of ids) qs.push(await getBankQuestion(trainerId, id));
  if (qs.some((q) => q.status === "archived")) throw new HttpError(409, "archived_question");
  if (!target.activityId && !target.newActivity) throw new HttpError(400, "target_required");
  return await tx(async () => {
    const activityId = target.activityId
      ? (await getActivity(trainerId, target.activityId)).id
      : await createActivity(trainerId, target.newActivity!.courseId, { title: target.newActivity!.title });
    const created: number[] = [];
    for (const q of qs) created.push(await createQuestion(trainerId, activityId, asInput(q), { bank_id: q.id, bank_version: q.version }));
    return { activityId, created };
  });
}

/** Saves an activity question into the bank and links the activity copy to it. */
export async function saveQuestionToBank(trainerId: number, questionId: number, m: BankMeta) {
  const q = await getQuestion(trainerId, questionId);
  if (q.bank_id) {
    const exists = await get("SELECT 1 FROM bank_questions WHERE id = ? AND trainer_id = ?", q.bank_id, trainerId);
    if (exists) throw new HttpError(409, "already_in_bank");
  }
  const v = validateQuestion(asInput(q) as unknown as Record<string, unknown>);
  if (!v.ok) throw new HttpError(400, v.error);
  return await tx(async () => {
      const id = await createBankQuestion(trainerId, v.value, m);
      await run("UPDATE questions SET bank_id = ?, bank_version = 1 WHERE id = ?", id, questionId);
      await touchCourse(q.course_id);
      return id;
    });
}

/** Updates an activity copy to the latest bank version (past runs keep their snapshots). */
export async function syncFromBank(trainerId: number, questionId: number) {
  const q = await getQuestion(trainerId, questionId);
  if (!q.bank_id) throw new HttpError(400, "not_linked");
  const b = await getBankQuestion(trainerId, q.bank_id);
  const i = asInput(b);
  await run(`UPDATE questions SET type=?, title=?, body=?, image=?, options=?, correct=?, explanation=?, points=?, time_limit=?, difficulty=?, bank_version=?, updated_at=? WHERE id=?`, i.type, i.title, i.body, i.image, JSON.stringify(i.options), JSON.stringify(i.correct), i.explanation, i.points, i.time_limit, i.difficulty, b.version, now(), questionId);
  await touchCourse(q.course_id);
  return { version: b.version };
}

/** Latest bank versions for linked activity questions (to flag "update available"). */
export async function bankVersions(trainerId: number, bankIds: number[]) {
  if (bankIds.length === 0) return {} as Record<number, { version: number; status: string }>;
  const rows = await all(`SELECT id, version, status FROM bank_questions WHERE trainer_id = ? AND id IN (${bankIds.map(() => "?").join(",")})`, trainerId, ...bankIds) as { id: number; version: number; status: string }[];
  return Object.fromEntries(rows.map((r) => [r.id, { version: r.version, status: r.status }]));
}
