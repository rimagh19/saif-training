import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Data layer. SQLite (WAL mode) stored on disk under DATA_DIR, so nothing is
 * lost when a browser closes or the server restarts. All SQL lives in
 * src/lib/repo/* so the engine can be swapped (e.g. PostgreSQL) later.
 */

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

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
function migrate(db: Database.Database) {
  const cols = new Set((db.prepare("PRAGMA table_info(activities)").all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("allow_change")) db.exec("ALTER TABLE activities ADD COLUMN allow_change INTEGER NOT NULL DEFAULT 0");
  if (!cols.has("q_show_dist")) db.exec("ALTER TABLE activities ADD COLUMN q_show_dist INTEGER NOT NULL DEFAULT 0");

  const qcols = new Set((db.prepare("PRAGMA table_info(questions)").all() as { name: string }[]).map((c) => c.name));
  if (!qcols.has("bank_id")) db.exec("ALTER TABLE questions ADD COLUMN bank_id INTEGER REFERENCES bank_questions(id) ON DELETE SET NULL");
  if (!qcols.has("bank_version")) db.exec("ALTER TABLE questions ADD COLUMN bank_version INTEGER");
  if (!qcols.has("deleted_at")) db.exec("ALTER TABLE questions ADD COLUMN deleted_at INTEGER");

  // Snapshot of each question as asked in a run, so later edits never rewrite history.
  const rcols = new Set((db.prepare("PRAGMA table_info(run_questions)").all() as { name: string }[]).map((c) => c.name));
  if (!rcols.has("snapshot")) db.exec("ALTER TABLE run_questions ADD COLUMN snapshot TEXT");
  db.exec(`UPDATE run_questions SET snapshot = (SELECT ${SNAPSHOT_SQL} FROM questions q WHERE q.id = run_questions.question_id) WHERE snapshot IS NULL`);
}

type G = typeof globalThis & { __safeDb?: Database.Database };

function open(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "platform.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function db(): Database.Database {
  const g = globalThis as G;
  if (!g.__safeDb) g.__safeDb = open();
  return g.__safeDb;
}

export const now = () => Date.now();

export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}
