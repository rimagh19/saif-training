// Trainee bypass-attempt tests: direct links + direct server requests.
// Run against a FRESH database: BASE=http://localhost:3101 node tests/trainee-security.mjs
import assert from "node:assert/strict";

const BASE = process.env.BASE || "http://localhost:3101";
const results = [];
let passed = 0;

class Client {
  constructor(name) { this.name = name; this.jar = new Map(); this.raw = []; }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      this.raw.push(c);
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (!v || /max-age=0/i.test(c)) this.jar.delete(k); else this.jar.set(k, v);
    }
  }
  async req(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), Cookie: this.cookieHeader(), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      redirect: "manual",
    });
    this.store(res);
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  get(p) { return this.req("GET", p); }
  post(p, b = {}) { return this.req("POST", p, b); }
  patch(p, b = {}) { return this.req("PATCH", p, b); }
  del(p) { return this.req("DELETE", p); }
}
async function test(name, fn) {
  try { await fn(); passed++; results.push(`  ✔ ${name}`); }
  catch (e) { results.push(`  ✘ ${name}\n      ${e.message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}
const expectStatus = (r, s, msg = "") => assert.equal(r.status, s, `${msg} expected ${s}, got ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const A = new Client("trainer");
const A2 = new Client("trainer2");
const T = new Client("trainee");
const U = new Client("trainee-2");
const V = new Client("trainee-3");
const X = {};

// secrets that must never reach a trainee before the trainer decides
const SECRET_COURSE = "دورة سرية للمدرب";
const SECRET_EXPLANATION = "شرح سري لا يظهر قبل الكشف";
const SECRET_ACCEPTED = "كلمة-مقبولة-سرية";

// ---------- setup ----------
await A.post("/api/auth/setup", { name: "مدرب", email: "t@safe.test", password: "Passw0rd!T" });
X.course = (await A.post("/api/courses", { title: SECRET_COURSE, mode: "remote" })).data.id;
X.act = (await A.post("/api/activities", { course_id: X.course, title: "نشاط المتدربين" })).data.id;
X.q1 = (await A.post("/api/questions", { activity_id: X.act, type: "mcq", title: "سؤال 1", options: [{ id: "a", text: "أ" }, { id: "b", text: "ب" }, { id: "c", text: "ج" }], correct: ["b"], explanation: SECRET_EXPLANATION, time_limit: 0 })).data.id;
X.q2 = (await A.post("/api/questions", { activity_id: X.act, type: "short", title: "سؤال 2", correct: [SECRET_ACCEPTED], time_limit: 0 })).data.id;
X.q3 = (await A.post("/api/questions", { activity_id: X.act, type: "order", title: "سؤال 3", options: [{ id: "s1", text: "1" }, { id: "s2", text: "2" }, { id: "s3", text: "3" }], time_limit: 0 })).data.id;
X.course2 = (await A.post("/api/courses", { title: "دورة أخرى" })).data.id;
X.act2 = (await A.post("/api/activities", { course_id: X.course2, title: "نشاط آخر" })).data.id;
X.q21 = (await A.post("/api/questions", { activity_id: X.act2, type: "tf", title: "صح أم خطأ", correct: ["true"], time_limit: 0 })).data.id;
await A.post(`/api/activities/${X.act}/control`, { action: "start" });
await A.post(`/api/activities/${X.act2}/control`, { action: "start" });
X.code = (await A.get(`/api/activities/${X.act}/live`)).data.activity.join_code;
X.code2 = (await A.get(`/api/activities/${X.act2}/live`)).data.activity.join_code;

// ---------- entry ----------
await test("QR/link entry: /play/<code> and /join?code= load the trainee app", async () => {
  const p = await T.get(`/play/${X.code}`);
  expectStatus(p, 200);
  assert.ok(!p.data.includes(SECRET_EXPLANATION) && !p.data.includes(SECRET_COURSE), "server HTML carries no activity data");
  expectStatus(await T.get(`/join?code=${X.code}`), 200);
});
await test("identity follows trainer settings (name + trainee ID required)", async () => {
  expectStatus(await T.post(`/api/play/${X.code}/join`, { name: "" , trainee_number: "1"}), 400);
  expectStatus(await T.post(`/api/play/${X.code}/join`, { name: "متدرب" }), 400);
  expectStatus(await T.post(`/api/play/${X.code}/join`, { name: "متدرب أول", trainee_number: "7001" }), 200);
  expectStatus(await U.post(`/api/play/${X.code}/join`, { name: "منتحل", trainee_number: "7001" }), 409, "same trainee ID");
  expectStatus(await U.post(`/api/play/${X.code}/join`, { name: "متدرب ثان", trainee_number: "7002" }), 200);
  expectStatus(await V.post(`/api/play/${X.code}/join`, { name: "متدرب ثالث", trainee_number: "7003" }), 200);
});
await test("name-only setting: trainee ID is not stored", async () => {
  expectStatus(await A.patch(`/api/activities/${X.act2}`, { identity_mode: "name" }), 200);
  const c = new Client("n");
  expectStatus(await c.post(`/api/play/${X.code2}/join`, { name: "اسم فقط", trainee_number: "999" }), 200);
  const live = (await A.get(`/api/activities/${X.act2}/live`)).data;
  assert.equal(live.participants[0].trainee_number, null);
});
await test("trainee cookie is httpOnly, scoped to /api/play, and no trainer session is issued", async () => {
  const c = T.raw.find((x) => x.startsWith(`safe_p_${X.act}=`));
  assert.ok(c, "participant cookie set");
  assert.match(c, /HttpOnly/i);
  assert.match(c, /Path=\/api\/play/i);
  assert.match(c, /SameSite=lax/i);
  assert.ok(!T.jar.has("safe_trainer"));
});

// ---------- direct links to admin pages ----------
const trainerPages = () => [
  "/", "/dashboard", "/courses", "/courses/new", `/courses/${X.course}`, `/courses/${X.course}/edit`, "/activities",
  `/activities/${X.act}`, `/activities/${X.act}/live`, "/library", "/reports", `/reports/activity/${X.act}`,
  `/reports/course/${X.course}`, "/settings", `/present/${X.act}`, `/print/activity/${X.act}`, `/print/course/${X.course}`, "/setup",
];
await test("every admin page opened by direct link redirects a trainee to /login and leaks nothing", async () => {
  for (const p of trainerPages()) {
    const r = await T.get(p);
    assert.ok([307, 308].includes(r.status), `${p} -> ${r.status}`);
    assert.match(r.headers.get("location") || "", /\/login$/, `${p} location ${r.headers.get("location")}`);
    const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    assert.ok(!body.includes(SECRET_COURSE) && !body.includes(SECRET_EXPLANATION), `${p} leaked data`);
  }
});
await test("guessing ids or a forged trainer cookie does not help", async () => {
  const forged = new Client("forged");
  forged.jar = new Map(T.jar);
  forged.jar.set("safe_trainer", "x".repeat(43));
  for (const p of ["/dashboard", `/courses/${X.course}`, `/activities/${X.act}/live`, `/present/${X.act}`]) {
    const r = await forged.get(p);
    assert.ok([307, 308].includes(r.status) && /\/login$/.test(r.headers.get("location") || ""), `${p} -> ${r.status}`);
  }
  // trainee token pasted into the trainer cookie
  const swapped = new Client("swap");
  swapped.jar.set("safe_trainer", T.jar.get(`safe_p_${X.act}`));
  expectStatus(await swapped.get(`/api/activities/${X.act}/live`), 401);
});

// ---------- direct server requests ----------
const trainerApis = () => [
  ["GET", `/api/courses/${X.course}`], ["POST", "/api/courses", { title: "x" }], ["PATCH", `/api/courses/${X.course}`, { title: "x" }], ["DELETE", `/api/courses/${X.course}`],
  ["POST", "/api/activities", { course_id: X.course, title: "x" }], ["PATCH", `/api/activities/${X.act}`, { reveal_to_trainees: true }], ["DELETE", `/api/activities/${X.act}`],
  ["GET", `/api/activities/${X.act}/live`], ["GET", `/api/activities/${X.act}/present`], ["GET", `/api/activities/${X.act}/stream`],
  ["POST", `/api/activities/${X.act}/control`, { action: "reveal" }], ["POST", `/api/activities/${X.act}/control`, { action: "show_dist", value: true }],
  ["POST", `/api/activities/${X.act}/reorder`, { ids: [X.q3, X.q2, X.q1] }], ["DELETE", `/api/activities/${X.act}/participants/1`],
  ["POST", "/api/questions", { activity_id: X.act, type: "tf", title: "x", correct: ["true"] }], ["GET", `/api/questions/${X.q1}`],
  ["PATCH", `/api/questions/${X.q1}`, { type: "tf", title: "x", correct: ["true"] }], ["DELETE", `/api/questions/${X.q1}`], ["POST", `/api/questions/${X.q1}/copy`, { activity_id: X.act2 }],
  ["PATCH", "/api/answers/1", { correct: true }], ["GET", `/api/export/activity/${X.act}`], ["GET", `/api/export/course/${X.course}`],
  ["POST", "/api/uploads", {}], ["PATCH", "/api/settings/profile", { name: "x", email: "x@x.io" }], ["POST", "/api/settings/password", { current: "x", next: "yyyyyyyy" }],
  ["POST", "/api/trainers", { name: "x", email: "hacker@x.io", password: "Passw0rd!H" }],
];
await test("every trainer API called directly with a trainee session returns 401", async () => {
  for (const [m, p, b] of trainerApis()) {
    const r = await T.req(m, p, b);
    expectStatus(r, 401, `${m} ${p}`);
  }
  expectStatus(await T.post("/api/auth/setup", { name: "x", email: "h@x.io", password: "Passw0rd!H" }), 403, "setup closed");
  // nothing changed
  const live = (await A.get(`/api/activities/${X.act}/live`)).data;
  assert.equal(live.questions.length, 3);
  assert.equal(live.activity.q_state, "idle");
});

// ---------- what a trainee receives ----------
const STATE_KEYS = ["activity", "server_now", "me", "q_state", "question", "my_answer", "can_answer", "answer_locked", "reveal", "my_score", "my_answered"].sort();
const QUESTION_KEYS = ["id", "type", "title", "body", "image", "options", "points", "time_limit", "deadline", "index", "total"].sort();
await test("waiting state: no question is sent before the trainer starts it", async () => {
  const s = (await T.get(`/api/play/${X.code}`)).data;
  assert.deepEqual(Object.keys(s).sort(), STATE_KEYS);
  assert.equal(s.question, null);
  assert.equal(s.me.name, "متدرب أول");
});
await test("open question: whitelisted fields only — no answer key, explanation or other trainees", async () => {
  await A.post(`/api/activities/${X.act}/control`, { action: "open" });
  await U.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choice: "b" } });
  const s = (await T.get(`/api/play/${X.code}`)).data;
  assert.deepEqual(Object.keys(s).sort(), STATE_KEYS);
  assert.deepEqual(Object.keys(s.question).sort(), QUESTION_KEYS);
  assert.ok(s.question.options.every((o) => Object.keys(o).sort().join() === "id,text"));
  assert.deepEqual(Object.keys(s.activity).sort(), ["allow_change", "code", "course_title", "identity_mode", "status", "title"]);
  const raw = JSON.stringify(s);
  for (const secret of [SECRET_EXPLANATION, "متدرب ثان", "7002", "متدرب ثالث", '"correct"', "is_correct", "distribution", "participants"]) {
    assert.ok(!raw.includes(secret), `leaked ${secret}`);
  }
});
await test("only the current question can be answered; tampered payloads are rejected", async () => {
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q2, answer: { text: "x" } }), 409, "future question");
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q21, answer: { choice: "true" } }), 409, "other activity's question");
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choice: "zzz" } }), 400);
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choices: ["a", "b"] } }), 400, "wrong shape");
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: "a" }), 400);
  expectStatus(await T.req("POST", `/api/play/${X.code}/answer`, "{not json"), 400);
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: "1 OR 1=1", answer: { choice: "a" } }), 404);
});
await test("single answer (default): a second submission is refused", async () => {
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choice: "a" } }), 200);
  const r = await T.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choice: "b" } });
  expectStatus(r, 409);
  assert.equal(r.data.error, "already_answered");
  const s = (await T.get(`/api/play/${X.code}`)).data;
  assert.deepEqual(s.my_answer, { choice: "a" }, "first answer kept");
  assert.equal(s.answer_locked, true);
  assert.equal(s.can_answer, false);
});
await test("double-tap / parallel requests store exactly one answer", async () => {
  const rs = await Promise.all(["a", "b", "c", "a", "b", "c", "a", "b"].map((c) => V.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choice: c } })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.status).join(","));
  assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.status === 409));
  const live = (await A.get(`/api/activities/${X.act}/live`)).data;
  assert.equal(live.answers.filter((a) => a.name === "متدرب ثالث").length, 1);
});
await test("when the trainer allows changes, the answer can be updated while open", async () => {
  expectStatus(await A.patch(`/api/activities/${X.act}`, { allow_change: true }), 200);
  const s = (await T.get(`/api/play/${X.code}`)).data;
  assert.equal(s.can_answer, true);
  assert.equal(s.answer_locked, false);
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choice: "b" } }), 200);
  expectStatus(await A.patch(`/api/activities/${X.act}`, { allow_change: false }), 200);
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choice: "c" } }), 409);
});
await test("closed question: no answers; reveal hidden when trainer disallows it", async () => {
  await A.post(`/api/activities/${X.act}/control`, { action: "close" });
  const n = new Client("late");
  expectStatus(await n.post(`/api/play/${X.code}/join`, { name: "متأخر", trainee_number: "7009" }), 200);
  expectStatus(await n.post(`/api/play/${X.code}/answer`, { question_id: X.q1, answer: { choice: "b" } }), 409);
  await A.patch(`/api/activities/${X.act}`, { reveal_to_trainees: false });
  await A.post(`/api/activities/${X.act}/control`, { action: "reveal" });
  const s = (await T.get(`/api/play/${X.code}`)).data;
  assert.equal(s.reveal, null);
  assert.ok(!JSON.stringify(s).includes(SECRET_EXPLANATION));
  await A.patch(`/api/activities/${X.act}`, { reveal_to_trainees: true });
  const s2 = (await T.get(`/api/play/${X.code}`)).data;
  assert.equal(s2.reveal.explanation, SECRET_EXPLANATION, "shown after trainer decides");
});
await test("short-answer accepted answers stay hidden until reveal", async () => {
  await A.post(`/api/activities/${X.act}/control`, { action: "next" });
  await A.post(`/api/activities/${X.act}/control`, { action: "open" });
  const big = "ب".repeat(5000);
  expectStatus(await T.post(`/api/play/${X.code}/answer`, { question_id: X.q2, answer: { text: big } }), 200);
  const s = (await T.get(`/api/play/${X.code}`)).data;
  assert.ok(!JSON.stringify(s).includes(SECRET_ACCEPTED));
  assert.equal(s.my_answer.text.length, 1000, "oversized answers truncated");
  const order = (await T.get(`/api/play/${X.code}`)).data;
  assert.equal(order.question.id, X.q2);
});
await test("ordering question is shuffled for trainees (solution order never sent)", async () => {
  await A.post(`/api/activities/${X.act}/control`, { action: "next" });
  await A.post(`/api/activities/${X.act}/control`, { action: "open" });
  for (const c of [T, U, V]) {
    const ids = (await c.get(`/api/play/${X.code}`)).data.question.options.map((o) => o.id);
    assert.notDeepEqual(ids, ["s1", "s2", "s3"]);
  }
});
await test("a trainee session works for its own activity only; forged tokens are ignored", async () => {
  const s = (await T.get(`/api/play/${X.code2}`)).data;
  assert.equal(s.me, null, "not joined to activity 2");
  expectStatus(await T.post(`/api/play/${X.code2}/answer`, { question_id: X.q21, answer: { choice: "true" } }), 401);
  const copy = new Client("copy");
  copy.jar.set(`safe_p_${X.act2}`, T.jar.get(`safe_p_${X.act}`));
  assert.equal((await copy.get(`/api/play/${X.code2}`)).data.me, null, "token copied to another activity is useless");
  const forged = new Client("forged-p");
  forged.jar.set(`safe_p_${X.act}`, "A".repeat(43));
  assert.equal((await forged.get(`/api/play/${X.code}`)).data.me, null);
  forged.jar.set(`safe_p_${X.act}`, "A".repeat(5000));
  expectStatus(await forged.get(`/api/play/${X.code}`), 200);
});
await test("trainee event stream carries change signals only (no data)", async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/play/${X.code}/stream`, { signal: ctrl.signal, headers: { Cookie: T.cookieHeader() } });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  setTimeout(() => U.post(`/api/play/${X.code}/answer`, { question_id: X.q3, answer: { order: ["s1", "s2", "s3"] } }), 200);
  const until = Date.now() + 4000;
  while (Date.now() < until && !buf.includes("event: change")) {
    const { value } = await reader.read();
    buf += dec.decode(value);
  }
  ctrl.abort();
  const m = buf.match(/event: change\ndata: (.*)\n/);
  assert.ok(m, "received a change event");
  assert.deepEqual(Object.keys(JSON.parse(m[1])).sort(), ["at", "kind"]);
  assert.ok(!buf.includes("متدرب"), "no names in stream");
});
await test("a participant removed by the trainer loses access immediately", async () => {
  const live = (await A.get(`/api/activities/${X.act}/live`)).data;
  const u = live.participants.find((p) => p.display_name === "متدرب ثان");
  expectStatus(await A.del(`/api/activities/${X.act}/participants/${u.id}`), 200);
  assert.equal((await U.get(`/api/play/${X.code}`)).data.me, null);
  expectStatus(await U.post(`/api/play/${X.code}/answer`, { question_id: X.q3, answer: { order: ["s1", "s2", "s3"] } }), 401);
});
await test("another trainer cannot see or control this activity either", async () => {
  await A.post("/api/trainers", { name: "مدرب آخر", email: "o@safe.test", password: "Passw0rd!O" });
  expectStatus(await A2.post("/api/auth/login", { email: "o@safe.test", password: "Passw0rd!O" }), 200);
  expectStatus(await A2.get(`/api/activities/${X.act}/live`), 404);
  expectStatus(await A2.post(`/api/activities/${X.act}/control`, { action: "end" }), 404);
  const r = await A2.get(`/activities/${X.act}/live`);
  assert.ok(r.status === 404 || !String(r.data).includes("نشاط المتدربين"));
});
await test("security headers block framing / sniffing on trainee pages", async () => {
  const r = await T.get(`/play/${X.code}`);
  assert.match(r.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await T.get(`/api/play/${X.code}`)).headers.get("cache-control"), "no-store");
});
await test("cross-site requests to trainee APIs are refused", async () => {
  expectStatus(await T.req("POST", `/api/play/${X.code}/answer`, { question_id: X.q3, answer: { order: ["s1", "s2", "s3"] } }, { Origin: "https://evil.example" }), 403);
  expectStatus(await new Client("x").req("POST", `/api/play/${X.code}/join`, { name: "x", trainee_number: "1" }, { Origin: "https://evil.example" }), 403);
});
await test("archived course closes the code", async () => {
  await A.patch(`/api/courses/${X.course2}`, { status: "archived" });
  expectStatus(await T.get(`/api/play/${X.code2}`), 404);
});
await test("scanning join codes is rate-limited", async () => {
  let last;
  for (let i = 0; i < 31; i++) last = await new Client("scan").get(`/api/play/${String(100000 + i)}`);
  expectStatus(last, 429);
  expectStatus(await T.get(`/api/play/${X.code}`), 429, "blocked while limited");
});

console.log(results.join("\n"));
console.log(`\n${passed}/${results.length} trainee security scenarios passed`);
process.exit(process.exitCode ?? 0);
