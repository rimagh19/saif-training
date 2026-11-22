import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import { connection } from "next/server";
import { createClient, type Client, type InStatement, type Transaction } from "@libsql/client";

/**
 * Data layer — libSQL (SQLite).
 *  - Production / Vercel: Turso cloud database (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
 *  - Local / own server:  a SQLite file under DATA_DIR (no extra software needed).
 * All access is async. Transactions use AsyncLocalStorage so any helper called
 * inside tx() automatically runs in that transaction.
 */

// Local file mode only (relative paths resolve from the folder the server is started in).
export const DATA_DIR = (process.env.DATA_DIR || "data").replace(/[\\/]+$/, "");
const REMOTE_URL = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "";
export const IS_REMOTE_DB = !!REMOTE_URL && !REMOTE_URL.startsWith("file:");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trainers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trainer_sessions (
  token_hash TEXT PRIMARY KEY,
  trainer_id INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  first_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trainer_id    INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  trainer_name  TEXT NOT NULL DEFAULT '',
  course_date   TEXT,
  mode          TEXT NOT NULL DEFAULT 'onsite' CHECK (mode IN ('onsite','remote')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','archived')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_courses_trainer ON courses(trainer_id);

CREATE TABLE IF NOT EXISTS activities (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id           INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  join_code           TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','ended')),
  identity_mode       TEXT NOT NULL DEFAULT 'name_id' CHECK (identity_mode IN ('name','name_id')),
  allow_late_edit     INTEGER NOT NULL DEFAULT 0,
  reveal_to_trainees  INTEGER NOT NULL DEFAULT 1,
  show_leaderboard    INTEGER NOT NULL DEFAULT 0,
  current_run_id      INTEGER,
  current_question_id INTEGER,
  q_state             TEXT NOT NULL DEFAULT 'idle' CHECK (q_state IN ('idle','open','closed','revealed')),
  q_opened_at         INTEGER,
  q_deadline          INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_course ON activities(course_id);

CREATE TABLE IF NOT EXISTS questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  type         TEXT NOT NULL CHECK (type IN ('mcq','tf','multi','short','scenario','order')),
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  image        TEXT,
  options      TEXT NOT NULL DEFAULT '[]',
  correct      TEXT NOT NULL DEFAULT '[]',
  explanation  TEXT NOT NULL DEFAULT '',
  points       INTEGER NOT NULL DEFAULT 1,
  time_limit   INTEGER NOT NULL DEFAULT 30,
  difficulty   TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy','medium','advanced')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_activity ON questions(activity_id, position);

CREATE TABLE IF NOT EXISTS runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  number       INTEGER NOT NULL,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  UNIQUE(activity_id, number)
);

CREATE TABLE IF NOT EXISTS run_questions (
  run_id       INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  opened_at    INTEGER NOT NULL,
  PRIMARY KEY (run_id, question_id)
);

CREATE TABLE IF NOT EXISTS participants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL,
  trainee_number  TEXT,
  token_hash      TEXT NOT NULL UNIQUE,
  joined_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_participants_run ON participants(run_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_participant_number ON participants(run_id, trainee_number) WHERE trainee_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS answers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  participant_id  INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  answer          TEXT NOT NULL,
  is_correct      INTEGER,
  score           INTEGER NOT NULL DEFAULT 0,
  graded_by       TEXT NOT NULL DEFAULT 'auto' CHECK (graded_by IN ('auto','trainer','pending')),
  submitted_at    INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE(run_id, question_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_answers_run_q ON answers(run_id, question_id);

-- Central question bank (per trainer). Activities hold their own copies.
CREATE TABLE IF NOT EXISTS bank_questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  trainer_id   INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('mcq','tf','multi','short','scenario','order')),
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  image        TEXT,
  options      TEXT NOT NULL DEFAULT '[]',
  correct      TEXT NOT NULL DEFAULT '[]',
  explanation  TEXT NOT NULL DEFAULT '',
  points       INTEGER NOT NULL DEFAULT 1,
  time_limit   INTEGER NOT NULL DEFAULT 30,
  difficulty   TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy','medium','advanced')),
  domain       TEXT NOT NULL DEFAULT '',
  specialty    TEXT NOT NULL DEFAULT '',
  topic        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  version      INTEGER NOT NULL DEFAULT 1,
  search_text  TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bank_trainer ON bank_questions(trainer_id, status);

CREATE TABLE IF NOT EXISTS bank_tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trainer_id  INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL COLLATE NOCASE,
  UNIQUE(trainer_id, name)
);

CREATE TABLE IF NOT EXISTS uploads (
  name        TEXT PRIMARY KEY,
  mime        TEXT NOT NULL,
  data        BLOB NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_question_tags (
  question_id INTEGER NOT NULL REFERENCES bank_questions(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES bank_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);
`;

/** SQL expression that captures a question exactly as it was asked (alias q). */
export const SNAPSHOT_SQL = `json_object('id', q.id, 'activity_id', q.activity_id, 'position', q.position, 'type', q.type, 'title', q.title,
  'body', q.body, 'image', q.image, 'options', json(q.options), 'correct', json(q.correct), 'explanation', q.explanation,
  'points', q.points, 'time_limit', q.time_limit, 'difficulty', q.difficulty)`;

/** Additive, idempotent migrations for databases created by earlier versions. */
/** Additive, idempotent migrations for databases created by earlier versions. */
async function migrate(c: Exec) {
  const cols = async (t: string) => new Set((await c.execute(`PRAGMA table_info(${t})`)).rows.map((r) => String(r.name)));
  const a = await cols("activities");
  if (!a.has("allow_change")) await c.execute("ALTER TABLE activities ADD COLUMN allow_change INTEGER NOT NULL DEFAULT 0");
  if (!a.has("q_show_dist")) await c.execute("ALTER TABLE activities ADD COLUMN q_show_dist INTEGER NOT NULL DEFAULT 0");
  if (!a.has("rev")) await c.execute("ALTER TABLE activities ADD COLUMN rev INTEGER NOT NULL DEFAULT 0");
  const q = await cols("questions");
  if (!q.has("bank_id")) await c.execute("ALTER TABLE questions ADD COLUMN bank_id INTEGER REFERENCES bank_questions(id) ON DELETE SET NULL");
  if (!q.has("bank_version")) await c.execute("ALTER TABLE questions ADD COLUMN bank_version INTEGER");
  if (!q.has("deleted_at")) await c.execute("ALTER TABLE questions ADD COLUMN deleted_at INTEGER");
  const r = await cols("run_questions");
  if (!r.has("snapshot")) await c.execute("ALTER TABLE run_questions ADD COLUMN snapshot TEXT");
  await c.execute(`UPDATE run_questions SET snapshot = (SELECT ${SNAPSHOT_SQL} FROM questions q WHERE q.id = run_questions.question_id) WHERE snapshot IS NULL`);
  await importLegacyUploads(c);
}

/** Images saved to disk by earlier versions are moved into the database once. */
async function importLegacyUploads(c: Exec) {
  const dir = `${DATA_DIR}/uploads`;
  if (IS_REMOTE_DB || !fs.existsSync(dir)) return;
  const mime: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  for (const f of fs.readdirSync(dir)) {
    if (!/^[a-f0-9]{32}\.(png|jpe?g|webp|gif)$/.test(f)) continue;
    await c.execute({
      sql: "INSERT OR IGNORE INTO uploads(name, mime, data, created_at) VALUES (?, ?, ?, ?)",
      args: [f, mime[f.split(".").pop()!], new Uint8Array(fs.readFileSync(`${dir}/${f}`)), Date.now()],
    });
  }
}

// ---------------------------------------------------------------- connection

type Exec = Pick<Client, "execute"> | Transaction;
type G = typeof globalThis & { __safeDb?: { client: Client; ready: Promise<void>; lock: Promise<unknown> } };

function state() {
  const g = globalThis as G;
  if (!g.__safeDb) {
    let client: Client;
    if (IS_REMOTE_DB) {
      client = createClient({ url: REMOTE_URL, authToken: process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN });
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      client = createClient({ url: REMOTE_URL || `file:${DATA_DIR}/platform.db` });
    }
    const ready = (async () => {
      if (!IS_REMOTE_DB) {
        await client.execute("PRAGMA journal_mode = WAL");
        await localPragmas(client);
      }
      await client.executeMultiple(SCHEMA);
      await migrate(client);
    })();
    g.__safeDb = { client, ready, lock: Promise.resolve() };
    ready.catch((e) => {
      console.error("Database initialisation failed:", e);
      g.__safeDb = undefined; // retry on next request
    });
  }
  return g.__safeDb;
}

async function localPragmas(c: Client) {
  await c.execute("PRAGMA foreign_keys = ON");
  await c.execute("PRAGMA busy_timeout = 5000");
}

// The local SQLite file is used through ONE connection, so statements are
// serialised with an in-process lock (transactions hold it until commit).
// Remote (Turso) handles concurrency itself.
const txStore = new AsyncLocalStorage<Exec>();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const s = state();
  const prev = s.lock;
  let release!: () => void;
  s.lock = new Promise<void>((r) => (release = r));
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
  }
}

type Arg = string | number | bigint | null | Uint8Array | ArrayBuffer;
const norm = (args: unknown[]): Arg[] =>
  args.map((a) => (a === undefined ? null : typeof a === "boolean" ? (a ? 1 : 0) : (a as Arg)));

const isBusy = (e: unknown) => /SQLITE_BUSY|database is locked/i.test(String((e as Error)?.message ?? e));

async function exec(stmt: InStatement) {
  // Never touch the database while Next.js pre-renders at build time — only for real requests.
  await connection();
  const s = state();
  await s.ready;
  const inTx = txStore.getStore();
  if (inTx) return inTx.execute(stmt);
  const go = () => s.client.execute(stmt);
  if (!IS_REMOTE_DB) return await withLock(go);
  for (let attempt = 0; ; attempt++) {
    try {
      return await go();
    } catch (e) {
      if (!isBusy(e) || attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
    }
  }
}

const plain = <T>(rows: unknown[]): T[] => rows.map((r) => ({ ...(r as object) }) as T);

/** All rows. */
export async function all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]> {
  return plain<T>((await exec({ sql, args: norm(args) })).rows);
}
/** First row or undefined. */
export async function get<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T | undefined> {
  return (await all<T>(sql, ...args))[0];
}
/** Write statement; returns affected rows and the new row id. */
export async function run(sql: string, ...args: unknown[]): Promise<{ changes: number; lastId: number }> {
  const r = await exec({ sql, args: norm(args) });
  return { changes: r.rowsAffected, lastId: r.lastInsertRowid !== undefined ? Number(r.lastInsertRowid) : 0 };
}

/** Runs fn atomically. Nested calls join the outer transaction. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return await fn();
  await connection();
  const s = state();
  await s.ready;
  if (!IS_REMOTE_DB) {
    return await withLock(async () => {
      // The local client hands its connection to the transaction and opens a fresh one
      // afterwards, so the per-connection settings are applied again once it is done.
      const t = await s.client.transaction("write");
      try {
        const out = await txStore.run(t, fn);
        await t.commit();
        return out;
      } catch (e) {
        await t.rollback().catch(() => {});
        throw e;
      } finally {
        t.close();
        await localPragmas(s.client);
      }
    });
  }
  for (let attempt = 0; ; attempt++) {
    let t: Transaction | null = null;
    try {
      t = await s.client.transaction("write");
      const out = await txStore.run(t, fn);
      await t.commit();
      return out;
    } catch (e) {
      await t?.rollback().catch(() => {});
      if (!isBusy(e) || attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 80 * 2 ** attempt));
    } finally {
      t?.close();
    }
  }
}

export const now = () => Date.now();
