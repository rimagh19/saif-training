// End-to-end permission & scenario tests against a running server.
// Usage: BASE=http://localhost:3100 node tests/scenarios.mjs
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const BASE = process.env.BASE || "http://localhost:3100";
let passed = 0;
const results = [];

class Client {
  constructor(name) { this.name = name; this.jar = new Map(); }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (!v || /max-age=0/i.test(c) || /expires=Thu, 01 Jan 1970/i.test(c)) this.jar.delete(k); else this.jar.set(k, v);
    }
  }
  async req(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), Cookie: this.cookieHeader(), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    this.store(res);
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("json") ? await res.json() : ct.includes("sheet") ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  get(p) { return this.req("GET", p); }
  post(p, b = {}) { return this.req("POST", p, b); }
  patch(p, b = {}) { return this.req("PATCH", p, b); }
  del(p) { return this.req("DELETE", p); }
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  ✔ ${name}`);
  } catch (e) {
    results.push(`  ✘ ${name}\n      ${e.message.split("\n").join("\n      ")}`);
    process.exitCode = 1;
  }
}
const expectStatus = (r, s, msg = "") => assert.equal(r.status, s, `${msg} expected ${s}, got ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const A = new Client("trainerA");
const B = new Client("trainerB");
const anon = new Client("anon");
const t1 = new Client("trainee1");
const t2 = new Client("trainee2");
const t3 = new Client("trainee3");
const ctx = {};

// ---------------- Auth ----------------
await test("first-run setup creates trainer A and signs in", async () => {
  expectStatus(await A.post("/api/auth/setup", { name: "مدرب أ", email: "a@safe.test", password: "Passw0rd!A" }), 200);
  assert.ok(A.jar.has("safe_trainer"));
});
await test("setup is closed once a trainer exists", async () => {
  expectStatus(await anon.post("/api/auth/setup", { name: "x", email: "x@x.io", password: "Passw0rd!X" }), 403);
});
await test("wrong password rejected; brute force is rate-limited", async () => {
  const c = new Client("bf");
  expectStatus(await c.post("/api/auth/login", { email: "a@safe.test", password: "nope" }), 401);
  for (let i = 0; i < 8; i++) await c.post("/api/auth/login", { email: "a@safe.test", password: "nope" });
  expectStatus(await c.post("/api/auth/login", { email: "a@safe.test", password: "Passw0rd!A" }), 429, "after 9 failures");
});
await test("cross-site POST is refused (Origin check)", async () => {
  const r = await A.req("POST", "/api/courses", { title: "x" }, { Origin: "https://evil.example" });
  expectStatus(r, 403);
});
await test("anonymous users get 401 on every trainer API", async () => {
  for (const [m, p] of [["POST", "/api/courses"], ["GET", "/api/courses/1"], ["POST", "/api/activities"], ["GET", "/api/activities/1/live"], ["POST", "/api/activities/1/control"], ["GET", "/api/questions/1"], ["POST", "/api/questions"], ["PATCH", "/api/answers/1"], ["GET", "/api/export/activity/1"], ["GET", "/api/activities/1/stream"], ["POST", "/api/trainers"]]) {
    const r = await anon.req(m, p, m === "GET" ? undefined : {});
    expectStatus(r, 401, `${m} ${p}`);
  }
});
await test("trainer pages redirect anonymous visitors to /login", async () => {
  for (const p of ["/dashboard", "/courses", "/activities/1/live", "/present/1", "/reports", "/print/activity/1"]) {
    const r = await anon.get(p);
    assert.ok([303, 307, 308].includes(r.status) || (typeof r.data === "string" && r.data.includes("/login")), `${p} -> ${r.status}`);
  }
});

// ---------------- Content creation ----------------
await test("trainer A creates a course and an activity", async () => {
  const c = await A.post("/api/courses", { title: "إدارة الأزمات الأمنية", description: "دورة تطبيقية", trainer_name: "مدرب أ", course_date: "2026-11-22", mode: "onsite", status: "draft" });
  expectStatus(c, 200);
  ctx.course = c.data.id;
  const a = await A.post("/api/activities", { course_id: ctx.course, title: "اختبار قبلي" });
  expectStatus(a, 200);
  ctx.activity = a.data.id;
});
await test("question validation rejects incomplete questions", async () => {
  expectStatus(await A.post("/api/questions", { activity_id: ctx.activity, type: "mcq", title: "س", options: [{ id: "a", text: "1" }, { id: "b", text: "2" }], correct: [] }), 400);
  expectStatus(await A.post("/api/questions", { activity_id: ctx.activity, type: "mcq", title: "س", options: [{ id: "a", text: "1" }], correct: ["a"] }), 400);
  expectStatus(await A.post("/api/questions", { activity_id: ctx.activity, type: "nope", title: "س" }), 400);
  expectStatus(await A.post("/api/questions", { activity_id: ctx.activity, type: "tf", title: "", body: "" , correct: ["true"]}), 400);
});
await test("all six question types can be created", async () => {
  const mk = async (q) => { const r = await A.post("/api/questions", { activity_id: ctx.activity, points: 1, time_limit: 0, difficulty: "easy", ...q }); expectStatus(r, 200, q.type); return r.data.id; };
  ctx.q = {};
  ctx.q.mcq = await mk({ type: "mcq", title: "ما أول إجراء عند اكتشاف حريق؟", options: [{ id: "a", text: "إطلاق الإنذار" }, { id: "b", text: "تصوير الموقع" }, { id: "c", text: "الانتظار" }], correct: ["a"], explanation: "الإنذار أولاً", points: 2 });
  ctx.q.tf = await mk({ type: "tf", title: "يجب إغلاق المخارج أثناء الإخلاء", correct: ["false"] });
  ctx.q.multi = await mk({ type: "multi", title: "اختر معدات الحماية", options: [{ id: "a", text: "خوذة" }, { id: "b", text: "قفازات" }, { id: "c", text: "عطر" }], correct: ["a", "b"] });
  ctx.q.short = await mk({ type: "short", title: "ما اسم القطاع؟", correct: ["الأمن"] });
  ctx.q.scenario = await mk({ type: "scenario", title: "سيناريو", body: "شخص مجهول يحاول الدخول…", options: [{ id: "a", text: "منعه بلطف والتحقق" }, { id: "b", text: "تجاهله" }], correct: ["a"] });
  ctx.q.order = await mk({ type: "order", title: "رتب خطوات الإخلاء", options: [{ id: "s1", text: "الإنذار" }, { id: "s2", text: "التوجه للمخرج" }, { id: "s3", text: "التجمع" }] });
  ctx.q.open = await mk({ type: "short", title: "صف تجربتك", correct: [] });
});
await test("questions can be reordered and edited", async () => {
  const ids = Object.values(ctx.q);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/reorder`, { ids: [...ids].reverse() }), 200);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/reorder`, { ids }), 200);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/reorder`, { ids: ids.slice(1) }), 400);
  const q = await A.get(`/api/questions/${ctx.q.tf}`);
  expectStatus(await A.patch(`/api/questions/${ctx.q.tf}`, { ...q.data, explanation: "المخارج تبقى مفتوحة" }), 200);
});

// ---------------- Isolation between trainers ----------------
await test("trainer A adds trainer B; B signs in", async () => {
  expectStatus(await A.post("/api/trainers", { name: "مدرب ب", email: "b@safe.test", password: "Passw0rd!B" }), 200);
  expectStatus(await B.post("/api/auth/login", { email: "b@safe.test", password: "Passw0rd!B" }), 200);
});
await test("trainer B cannot read or change anything of trainer A (404)", async () => {
  for (const [m, p, b] of [
    ["GET", `/api/courses/${ctx.course}`], ["PATCH", `/api/courses/${ctx.course}`, { title: "hack" }], ["DELETE", `/api/courses/${ctx.course}`],
    ["POST", "/api/activities", { course_id: ctx.course, title: "x" }], ["PATCH", `/api/activities/${ctx.activity}`, { title: "x" }],
    ["DELETE", `/api/activities/${ctx.activity}`], ["GET", `/api/activities/${ctx.activity}/live`], ["POST", `/api/activities/${ctx.activity}/control`, { action: "start" }],
    ["GET", `/api/activities/${ctx.activity}/stream`], ["GET", `/api/questions/${ctx.q.mcq}`], ["PATCH", `/api/questions/${ctx.q.mcq}`, { type: "tf", title: "x", correct: ["true"] }],
    ["DELETE", `/api/questions/${ctx.q.mcq}`], ["POST", "/api/questions", { activity_id: ctx.activity, type: "tf", title: "x", correct: ["true"] }],
    ["POST", `/api/questions/${ctx.q.mcq}/copy`, { activity_id: ctx.activity }], ["GET", `/api/export/activity/${ctx.activity}`], ["GET", `/api/export/course/${ctx.course}`],
  ]) {
    const r = await B.req(m, p, b);
    expectStatus(r, 404, `${m} ${p}`);
  }
  const page = await B.get(`/courses/${ctx.course}`);
  assert.ok(page.status === 404 || !String(page.data).includes("إدارة الأزمات الأمنية"), "B must not see A's course page");
});

// ---------------- Live session ----------------
await test("trainees cannot join before the trainer starts", async () => {
  const code = (await A.get(`/api/activities/${ctx.activity}/live`)).data.activity.join_code;
  ctx.code = code;
  expectStatus(await t1.post(`/api/play/${code}/join`, { name: "سالم", trainee_number: "1001" }), 409);
  expectStatus(await t1.get(`/api/play/999999`), 404);
});
await test("trainer starts; course becomes active; trainee identity is enforced", async () => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "start" }), 200);
  assert.equal((await A.get(`/api/courses/${ctx.course}`)).data.status, "active");
  expectStatus(await t1.post(`/api/play/${ctx.code}/join`, { name: "سالم" }), 400, "missing trainee number");
  expectStatus(await t1.post(`/api/play/${ctx.code}/join`, { name: "سالم", trainee_number: "1001" }), 200);
  expectStatus(await t2.post(`/api/play/${ctx.code}/join`, { name: "منتحل", trainee_number: "1001" }), 409, "duplicate trainee number");
  expectStatus(await t2.post(`/api/play/${ctx.code}/join`, { name: "نورة", trainee_number: "1002" }), 200);
  expectStatus(await t3.post(`/api/play/${ctx.code}/join`, { name: "فهد", trainee_number: "1003" }), 200);
});
await test("trainee session gives no access to trainer APIs or pages", async () => {
  expectStatus(await t1.get(`/api/activities/${ctx.activity}/live`), 401);
  expectStatus(await t1.post(`/api/activities/${ctx.activity}/control`, { action: "reveal" }), 401);
  expectStatus(await t1.post("/api/questions", { activity_id: ctx.activity, type: "tf", title: "x", correct: ["true"] }), 401);
  expectStatus(await t1.del(`/api/questions/${ctx.q.mcq}`), 401);
  expectStatus(await t1.get(`/api/questions/${ctx.q.mcq}`), 401);
  expectStatus(await t1.get(`/api/export/activity/${ctx.activity}`), 401);
  const r = await t1.get("/dashboard");
  assert.ok([303, 307, 308].includes(r.status) || String(r.data).includes("/login"));
});
await test("before a question is opened, trainees see nothing of it", async () => {
  const s = (await t1.get(`/api/play/${ctx.code}`)).data;
  assert.equal(s.question, null);
  assert.equal(s.me.name, "سالم");
});

// Live-update channel for the trainee: SSE (own server) or revision polling (serverless)
const MODE = (await t1.get(`/api/play/${ctx.code}`)).data.realtime;
const revBefore = (await t1.get(`/api/play/${ctx.code}`)).data.rev;
let sseEvents = 0;
const sseAbort = new AbortController();
(async () => {
  if (MODE !== "sse") return;
  try {
    const res = await fetch(`${BASE}/api/play/${ctx.code}/stream`, { signal: sseAbort.signal, headers: { Cookie: t1.cookieHeader() } });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      sseEvents += (dec.decode(value).match(/event: change/g) || []).length;
    }
  } catch {}
})();
await sleep(300);

await test("open question: trainee sees it WITHOUT correct answer or explanation", async () => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "open" }), 200);
  const s = (await t1.get(`/api/play/${ctx.code}`)).data;
  assert.equal(s.question.id, ctx.q.mcq);
  assert.equal(s.q_state, "open");
  assert.ok(!("correct" in s.question) && !("explanation" in s.question), "no answer key fields");
  assert.equal(s.reveal, null);
  const raw = JSON.stringify(s);
  assert.ok(!raw.includes("الإنذار أولاً"), "explanation text must not leak");
  assert.ok(s.can_answer);
});
await test(`live updates reach clients without manual refresh (${MODE})`, async () => {
  if (MODE === "sse") {
    await sleep(500);
    assert.ok(sseEvents >= 1, `expected change events, got ${sseEvents}`);
  } else {
    expectStatus(await t1.get(`/api/play/${ctx.code}/stream`), 204, "no streams on serverless");
    const cur = (await t1.get(`/api/play/${ctx.code}`)).data.rev;
    assert.ok(cur > revBefore, "revision advanced after the trainer opened the question");
    expectStatus(await t1.get(`/api/play/${ctx.code}?rev=${cur}`), 204, "unchanged revision → cheap 204");
    expectStatus(await t1.get(`/api/play/${ctx.code}?rev=${revBefore}`), 200, "older revision → full state");
  }
});
await test("answer validation: wrong question / malformed answer rejected", async () => {
  expectStatus(await t1.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.tf, answer: { choice: "true" } }), 409);
  expectStatus(await t1.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "zzz" } }), 400);
  expectStatus(await anon.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "a" } }), 401, "not joined");
});
await test("trainees answer; may change while open; trainer sees answers live", async () => {
  expectStatus(await A.patch(`/api/activities/${ctx.activity}`, { allow_change: true }), 200);
  expectStatus(await t1.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "b" } }), 200);
  expectStatus(await t1.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "a" } }), 200);
  expectStatus(await t2.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "b" } }), 200);
  const live = (await A.get(`/api/activities/${ctx.activity}/live`)).data;
  assert.equal(live.answers.length, 2);
  assert.equal(live.participants.length, 3);
  assert.equal(live.distribution.find((x) => x.id === "a").count, 1);
  assert.equal(live.distribution.find((x) => x.id === "b").count, 1);
});
await test("presenter screen: no correct answer, explanation or names before reveal", async () => {
  const p = await A.get(`/api/activities/${ctx.activity}/present`);
  expectStatus(p, 200);
  const raw = JSON.stringify(p.data);
  assert.equal(p.data.answered, 2);
  assert.equal(p.data.participants, 3);
  assert.ok(p.data.question.options.every((o) => o.correct === null && o.count === null && o.percent === null), "nothing revealed by default");
  assert.equal(p.data.question.explanation, null);
  assert.ok(!raw.includes("الإنذار أولاً") && !raw.includes("سالم") && !raw.includes("نورة"), "no explanation or trainee names");
  assert.equal(p.data.outcome, null, "correct/wrong split would reveal the answer");
});
await test("presenter screen: trainer can show distribution without revealing the answer", async () => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "show_dist", value: true }), 200);
  const p = (await A.get(`/api/activities/${ctx.activity}/present`)).data;
  const a = p.question.options.find((o) => o.id === "a");
  const b = p.question.options.find((o) => o.id === "b");
  assert.equal(a.count, 1); assert.equal(a.percent, 50); assert.equal(b.percent, 50);
  assert.ok(p.question.options.every((o) => o.correct === null), "still no correct flag");
  const tr = (await t1.get(`/api/play/${ctx.code}`)).data;
  assert.equal(tr.reveal, null, "trainees unaffected");
  assert.ok(!("distribution" in tr));
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "show_dist", value: false }), 200);
  assert.equal((await A.get(`/api/activities/${ctx.activity}/present`)).data.question.options[0].count, null);
});
await test("presenter endpoint is trainer-only and owner-only", async () => {
  expectStatus(await anon.get(`/api/activities/${ctx.activity}/present`), 401);
  expectStatus(await t1.get(`/api/activities/${ctx.activity}/present`), 401);
  expectStatus(await B.get(`/api/activities/${ctx.activity}/present`), 404);
  expectStatus(await B.post(`/api/activities/${ctx.activity}/control`, { action: "show_dist", value: true }), 404);
  expectStatus(await t1.post(`/api/activities/${ctx.activity}/control`, { action: "show_dist", value: true }), 401);
});
await test("trainees never receive other trainees' answers", async () => {
  const s = (await t2.get(`/api/play/${ctx.code}`)).data;
  const raw = JSON.stringify(s);
  assert.ok(!raw.includes("سالم") && !raw.includes("فهد"), "no other names");
  assert.deepEqual(s.my_answer, { choice: "b" });
  assert.ok(!("answers" in s) && !("participants" in s) && !("distribution" in s));
});
await test("closed question: answers and edits are refused", async () => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "close" }), 200);
  expectStatus(await t3.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "a" } }), 409);
  expectStatus(await t2.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "a" } }), 409);
  assert.equal((await t2.get(`/api/play/${ctx.code}`)).data.can_answer, false);
});
await test("trainer can allow editing after close", async () => {
  expectStatus(await A.patch(`/api/activities/${ctx.activity}`, { allow_late_edit: true }), 200);
  expectStatus(await t3.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "a" } }), 200);
  expectStatus(await A.patch(`/api/activities/${ctx.activity}`, { allow_late_edit: false }), 200);
});
await test("reveal: correct answer shown to trainees only when allowed; answers locked", async () => {
  expectStatus(await A.patch(`/api/activities/${ctx.activity}`, { reveal_to_trainees: false }), 200);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "reveal" }), 200);
  let s = (await t2.get(`/api/play/${ctx.code}`)).data;
  assert.equal(s.reveal, null, "hidden when not allowed");
  expectStatus(await A.patch(`/api/activities/${ctx.activity}`, { reveal_to_trainees: true }), 200);
  s = (await t2.get(`/api/play/${ctx.code}`)).data;
  assert.deepEqual(s.reveal.correct, ["a"]);
  assert.equal(s.reveal.is_correct, false);
  assert.equal(s.reveal.explanation, "الإنذار أولاً");
  const pr = (await A.get(`/api/activities/${ctx.activity}/present`)).data;
  assert.equal(pr.question.options.find((o) => o.id === "a").correct, true, "presenter shows correct after reveal");
  assert.equal(pr.question.explanation, "الإنذار أولاً");
  assert.ok(pr.question.options.every((o) => o.count !== null), "distribution shown on reveal");
  expectStatus(await A.patch(`/api/activities/${ctx.activity}`, { allow_late_edit: true }), 200);
  expectStatus(await t2.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "a" } }), 409, "never after reveal");
  expectStatus(await A.patch(`/api/activities/${ctx.activity}`, { allow_late_edit: false }), 200);
});
await test("trainer can extend the timer of an open question; distribution resets per question", async () => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "goto", questionId: ctx.q.mcq }), 200);
  assert.equal((await A.get(`/api/activities/${ctx.activity}/present`)).data.activity.q_show_dist, false);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "extend", seconds: 15 }), 409, "not open");
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "open", seconds: 10 }), 200);
  const before = (await A.get(`/api/activities/${ctx.activity}/live`)).data.activity.q_deadline;
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "extend", seconds: 15 }), 200);
  const after = (await A.get(`/api/activities/${ctx.activity}/live`)).data.activity.q_deadline;
  assert.ok(after - before >= 14000, `extended by ${after - before}ms`);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "close" }), 200);
});
await test("timer: answers are refused after the time limit", async () => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "next" }), 200);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "open", seconds: 1 }), 200);
  expectStatus(await t1.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.tf, answer: { choice: "false" } }), 200);
  await sleep(2800);
  expectStatus(await t2.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.tf, answer: { choice: "true" } }), 409);
  assert.equal((await A.get(`/api/activities/${ctx.activity}/live`)).data.activity.q_state, "closed");
});
const step = async (qid, answers) => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "goto", questionId: qid }), 200);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "open" }), 200);
  for (const [c, a] of answers) expectStatus(await c.post(`/api/play/${ctx.code}/answer`, { question_id: qid, answer: a }), 200, c.name);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "close" }), 200);
};
await test("grading: multiple answers, Arabic-normalised short text, scenario, ordering", async () => {
  await step(ctx.q.multi, [[t1, { choices: ["b", "a"] }], [t2, { choices: ["a"] }], [t3, { choices: ["a", "b", "c"] }]]);
  await step(ctx.q.short, [[t1, { text: "الامن" }], [t2, { text: "  الأمْن " }], [t3, { text: "المرور" }]]);
  await step(ctx.q.scenario, [[t1, { choice: "a" }], [t2, { choice: "b" }]]);
  // ordering: trainee receives a shuffled order, never the solution
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "goto", questionId: ctx.q.order }), 200);
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "open" }), 200);
  const shown = (await t1.get(`/api/play/${ctx.code}`)).data.question.options.map((o) => o.id);
  assert.notDeepEqual(shown, ["s1", "s2", "s3"], "order question must be shuffled");
  const pres = (await A.get(`/api/activities/${ctx.activity}/present`)).data;
  assert.notDeepEqual(pres.question.options.map((o) => o.id), ["s1", "s2", "s3"], "projector must not show the solution order");
  expectStatus(await t1.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.order, answer: { order: ["s1", "s2", "s3"] } }), 200);
  expectStatus(await t2.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.order, answer: { order: ["s2", "s1", "s3"] } }), 200);
  expectStatus(await t3.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.order, answer: { order: ["s1", "s2"] } }), 400, "incomplete order");
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "close" }), 200);
  const rep = await A.get(`/api/activities/${ctx.activity}/live`);
  assert.equal(rep.status, 200);
});
await test("open text question is pending until the trainer grades it", async () => {
  await step(ctx.q.open, [[t1, { text: "تجربة جيدة" }]]);
  const live = (await A.get(`/api/activities/${ctx.activity}/live`)).data;
  const ans = live.answers[0];
  assert.equal(ans.is_correct, null);
  expectStatus(await B.patch(`/api/answers/${ans.id}`, { correct: true }), 404, "other trainer cannot grade");
  expectStatus(await A.patch(`/api/answers/${ans.id}`, { correct: true }), 200);
  assert.equal((await A.get(`/api/activities/${ctx.activity}/live`)).data.answers[0].is_correct, 1);
});
await test("report figures are correct (scores, percentages, participation, most-wrong)", async () => {
  // points: mcq 2, others 1 → asked: mcq,tf,multi,short,scenario,order,open = 8 max
  // t1: mcq✔2 tf✔1 multi✔1 short✔1 scen✔1 order✔1 open✔1 = 8 → 100%
  // t2: mcq✘ tf– multi✘ short✔1 scen✘ order✘ = 1 → 12.5%
  // t3: mcq✔2 (late edit) multi✘ short✘ = 2 → 25%
  const html = await A.get(`/reports/activity/${ctx.activity}`);
  expectStatus(html, 200);
  const xlsx = await A.get(`/api/export/activity/${ctx.activity}`);
  expectStatus(xlsx, 200);
  assert.ok(xlsx.headers.get("content-type").includes("spreadsheetml"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx.data);
  const ws = wb.worksheets[1];
  const rows = [];
  ws.eachRow((r, i) => i > 1 && rows.push(r.values.slice(1)));
  const byName = Object.fromEntries(rows.map((r) => [r[0], r]));
  assert.deepEqual(byName["سالم"].slice(2), [7, 0, 0, 0, "8 / 8", 1]);
  assert.deepEqual(byName["نورة"].slice(2), [1, 4, 2, 0, "1 / 8", 0.125]);
  assert.deepEqual(byName["فهد"].slice(2), [1, 2, 4, 0, "2 / 8", 0.25]);
  const summary = wb.worksheets[0];
  const kv = {};
  summary.eachRow((r) => (kv[r.values[1]] = r.values[2]));
  assert.equal(kv["متوسط نتائج المجموعة"], "45.8%");
  // participation: answers 7 + 5 + 3 = 15 of 3*7=21 → 71.4%
  assert.equal(kv["نسبة المشاركة"], "71.4%");
  const qs = wb.worksheets[2];
  const first = qs.getRow(2).values;
  assert.ok(first[8] >= qs.getRow(3).values[8], "sorted by wrong rate");
  ctx.wb = wb;
});
await test("restart keeps previous results and requires trainees to re-join", async () => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "restart" }), 200);
  const s = (await t1.get(`/api/play/${ctx.code}`)).data;
  assert.equal(s.me, null, "old trainee token is not valid for the new run");
  const live = (await A.get(`/api/activities/${ctx.activity}/live`)).data;
  assert.equal(live.run.number, 2);
  assert.equal(live.participants.length, 0);
  // run #1 (fresh database → id 1) is still fully available
  const old = await A.get(`/api/export/activity/${ctx.activity}?run=1`);
  expectStatus(old, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(old.data);
  assert.equal(wb.worksheets[1].rowCount, 4, "3 participants of run 1 preserved");
  expectStatus(await t1.post(`/api/play/${ctx.code}/join`, { name: "سالم", trainee_number: "1001" }), 200, "same number allowed in new run");
});
await test("end activity: trainees can no longer join or answer", async () => {
  expectStatus(await A.post(`/api/activities/${ctx.activity}/control`, { action: "end" }), 200);
  expectStatus(await t2.post(`/api/play/${ctx.code}/join`, { name: "نورة", trainee_number: "1002" }), 409);
  expectStatus(await t1.post(`/api/play/${ctx.code}/answer`, { question_id: ctx.q.mcq, answer: { choice: "a" } }), 409);
  assert.equal((await t1.get(`/api/play/${ctx.code}`)).data.activity.status, "ended");
});
await test("courses are independent: second course has its own questions and results", async () => {
  const c2 = (await A.post("/api/courses", { title: "دورة ثانية", mode: "remote" })).data.id;
  const a2 = (await A.post("/api/activities", { course_id: c2, title: "نشاط" })).data.id;
  const copy = await A.post(`/api/questions/${ctx.q.mcq}/copy`, { activity_id: a2 });
  expectStatus(copy, 200);
  assert.notEqual(copy.data.id, ctx.q.mcq);
  const xlsx = await A.get(`/api/export/course/${c2}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx.data);
  assert.equal(wb.worksheets[2].rowCount, 1, "no trainees leaked into the new course");
  ctx.course2 = c2;
});
await test("archived course closes its join code; deleting removes data", async () => {
  expectStatus(await A.patch(`/api/courses/${ctx.course}`, { status: "archived" }), 200);
  expectStatus(await t1.get(`/api/play/${ctx.code}`), 404);
  expectStatus(await A.patch(`/api/courses/${ctx.course}`, { status: "completed" }), 200);
  expectStatus(await A.del(`/api/courses/${ctx.course2}`), 200);
  expectStatus(await A.get(`/api/courses/${ctx.course2}`), 404);
});
await test("uploads accept only real images from trainers", async () => {
  const fd = new FormData();
  fd.append("file", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "x.png");
  let r = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd, headers: { Cookie: A.cookieHeader() } });
  assert.equal(r.status, 415);
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000050001", "hex");
  const fd2 = new FormData();
  fd2.append("file", new Blob([png], { type: "image/png" }), "x.png");
  r = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd2, headers: { Cookie: t1.cookieHeader() } });
  assert.equal(r.status, 401, "trainee cannot upload");
  r = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd2, headers: { Cookie: A.cookieHeader() } });
  assert.equal(r.status, 200);
  const { name } = await r.json();
  assert.match(name, /^[a-f0-9]{32}\.png$/);
  assert.equal((await fetch(`${BASE}/api/uploads/../../etc/passwd`)).status, 404);
  ctx.upload = name;
});
await test("logout invalidates the session server-side", async () => {
  const token = A.jar.get("safe_trainer");
  expectStatus(await A.post("/api/auth/logout"), 200);
  const replay = new Client("replay");
  replay.jar.set("safe_trainer", token);
  expectStatus(await replay.get(`/api/courses/${ctx.course}`), 401);
});

sseAbort.abort();
console.log(results.join("\n"));
console.log(`\n${passed}/${results.length} scenarios passed`);
process.exit(process.exitCode ?? 0);
