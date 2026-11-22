/**
 * Question model, validation and grading. Shared by server and client
 * (no server-only imports here) — but grading is only ever trusted server-side.
 */

export const QUESTION_TYPES = ["mcq", "tf", "multi", "short", "scenario", "order"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const DIFFICULTIES = ["easy", "medium", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type Option = { id: string; text: string };

export type QuestionInput = {
  type: QuestionType;
  title: string;
  body: string;
  image: string | null;
  options: Option[];
  /** mcq/tf/scenario: [optionId]; multi: optionIds; order: optionIds in correct order; short: accepted answers */
  correct: string[];
  explanation: string;
  points: number;
  time_limit: number;
  difficulty: Difficulty;
};

export type Question = QuestionInput & { id: number; activity_id: number; position: number; bank_id?: number | null; bank_version?: number | null };

export type AnswerPayload =
  | { choice: string }
  | { choices: string[] }
  | { text: string }
  | { order: string[] };

export const TF_OPTIONS: Option[] = [
  { id: "true", text: "صح | True" },
  { id: "false", text: "خطأ | False" },
];

export const usesOptions = (t: QuestionType) => t !== "short";
export const singleChoice = (t: QuestionType) => t === "mcq" || t === "tf" || t === "scenario";

const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type ValidationResult = { ok: true; value: QuestionInput } | { ok: false; error: string };

export function validateQuestion(raw: Record<string, unknown>): ValidationResult {
  const type = raw.type as QuestionType;
  if (!QUESTION_TYPES.includes(type)) return { ok: false, error: "invalid_type" };
  const title = s(raw.title, 300);
  const body = s(raw.body, 8000);
  if (!title && !body) return { ok: false, error: "question_text_required" };
  const difficulty = (DIFFICULTIES as readonly string[]).includes(raw.difficulty as string) ? (raw.difficulty as Difficulty) : "easy";
  const image = typeof raw.image === "string" && /^[a-f0-9]{32}\.(png|jpe?g|webp|gif)$/.test(raw.image) ? raw.image : null;

  let options: Option[] = [];
  let correct: string[] = [];
  const rawCorrect = Array.isArray(raw.correct) ? raw.correct.map((c) => String(c)) : [];

  if (type === "tf") {
    options = TF_OPTIONS;
    correct = rawCorrect.filter((c) => c === "true" || c === "false").slice(0, 1);
    if (correct.length !== 1) return { ok: false, error: "select_correct" };
  } else if (type === "short") {
    correct = rawCorrect.map((c) => c.trim().slice(0, 300)).filter(Boolean).slice(0, 20);
  } else {
    const rawOpts = Array.isArray(raw.options) ? raw.options : [];
    const seen = new Set<string>();
    options = rawOpts
      .map((o) => {
        const obj = (o ?? {}) as Record<string, unknown>;
        return { id: s(obj.id, 40), text: s(obj.text, 1000) };
      })
      .filter((o) => o.id && o.text && !seen.has(o.id) && (seen.add(o.id), true))
      .slice(0, 12);
    if (options.length < 2) return { ok: false, error: "min_two_options" };
    const ids = new Set(options.map((o) => o.id));
    if (type === "order") {
      // the authored option order is the correct order
      correct = options.map((o) => o.id);
    } else {
      correct = [...new Set(rawCorrect.filter((c) => ids.has(c)))];
      if (singleChoice(type) && correct.length !== 1) return { ok: false, error: "select_correct" };
      if (type === "multi" && correct.length < 1) return { ok: false, error: "select_correct" };
    }
  }

  return {
    ok: true,
    value: {
      type,
      title,
      body,
      image,
      options,
      correct,
      explanation: s(raw.explanation, 4000),
      points: clampInt(raw.points, 0, 1000, 1),
      time_limit: clampInt(raw.time_limit, 0, 3600, 30),
      difficulty,
    },
  };
}

/** Arabic-aware normalisation for free-text answers. */
export function normalizeText(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "") // harakat, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Validates the shape of a trainee answer against the question. Returns null when invalid. */
export function sanitizeAnswer(q: Pick<Question, "type" | "options">, raw: unknown): AnswerPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ids = new Set(q.options.map((o) => o.id));
  switch (q.type) {
    case "mcq":
    case "tf":
    case "scenario": {
      const c = String(r.choice ?? "");
      return ids.has(c) ? { choice: c } : null;
    }
    case "multi": {
      if (!Array.isArray(r.choices)) return null;
      const cs = [...new Set(r.choices.map(String))];
      if (cs.length === 0 || cs.some((c) => !ids.has(c))) return null;
      return { choices: cs };
    }
    case "short": {
      const tx = typeof r.text === "string" ? r.text.trim().slice(0, 1000) : "";
      return tx ? { text: tx } : null;
    }
    case "order": {
      if (!Array.isArray(r.order)) return null;
      const o = r.order.map(String);
      if (o.length !== ids.size || new Set(o).size !== o.length || o.some((c) => !ids.has(c))) return null;
      return { order: o };
    }
  }
}

/** Returns true/false, or null when the answer needs manual grading by the trainer. */
export function grade(q: Pick<Question, "type" | "correct">, a: AnswerPayload): boolean | null {
  switch (q.type) {
    case "mcq":
    case "tf":
    case "scenario":
      return "choice" in a && a.choice === q.correct[0];
    case "multi": {
      if (!("choices" in a)) return false;
      const want = new Set(q.correct);
      return a.choices.length === want.size && a.choices.every((c) => want.has(c));
    }
    case "order":
      return "order" in a && a.order.length === q.correct.length && a.order.every((c, i) => c === q.correct[i]);
    case "short": {
      if (!("text" in a)) return false;
      if (q.correct.length === 0) return null;
      const t = normalizeText(a.text);
      return q.correct.some((c) => normalizeText(c) === t);
    }
  }
}

/** Labels for true/false options in the reader's language (pass the dictionary). */
export type TfLabels = { tf_true: string; tf_false: string };

/** Human-readable rendering of an answer, for trainer views and exports. */
export function describeAnswer(q: Pick<Question, "type" | "options">, a: AnswerPayload | null, tf?: TfLabels): string {
  if (!a) return "—";
  const label = (id: string) =>
    q.type === "tf" && tf && (id === "true" || id === "false") ? (id === "true" ? tf.tf_true : tf.tf_false) : (q.options.find((o) => o.id === id)?.text ?? id);
  if ("choice" in a) return label(a.choice);
  if ("choices" in a) return a.choices.map(label).join("، ");
  if ("order" in a) return a.order.map((id, i) => `${i + 1}) ${label(id)}`).join("  ");
  if ("text" in a) return a.text;
  return "—";
}

export function describeCorrect(q: Pick<Question, "type" | "options" | "correct">, tf?: TfLabels): string {
  if (q.type === "short") return q.correct.join(" / ") || "—";
  if (q.type === "order") return describeAnswer(q, { order: q.correct }, tf);
  if (q.type === "multi") return describeAnswer(q, { choices: q.correct }, tf);
  return describeAnswer(q, { choice: q.correct[0] ?? "" }, tf);
}

/** Deterministic shuffle so a trainee always sees the same order for an ordering question. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let x = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  // never present the solution as the starting order
  if (a.length > 1 && a.every((v, i) => v === items[i])) a.push(a.shift()!);
  return a;
}
