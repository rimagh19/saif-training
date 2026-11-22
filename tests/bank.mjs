// Central question bank tests. Run against a FRESH database: BASE=http://localhost:3102 node tests/bank.mjs
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const BASE = process.env.BASE || "http://localhost:3102";
const results = [];
let passed = 0;

class Client {
  constructor() { this.jar = new Map(); }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), Cookie: this.cookieHeader() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      this.jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("json") ? await res.json() : ct.includes("sheet") ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { status: res.status, data };
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
const ok = (r, s = 200, m = "") => assert.equal(r.status, s, `${m} expected ${s}, got ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
const ids = (r) => r.data.items.map((i) => i.id).sort((a, b) => a - b);

const A = new Client(), B = new Client(), T = new Client();
const X = {};
ok(await A.post("/api/auth/setup", { name: "مدرب", email: "bank@safe.test", password: "Passw0rd!K" }));
ok(await A.post("/api/trainers", { name: "آخر", email: "other@safe.test", password: "Passw0rd!O" }));
ok(await B.post("/api/auth/login", { email: "other@safe.test", password: "Passw0rd!O" }));

const mcq = (title, extra = {}) => ({
  type: "mcq", title, options: [{ id: "a", text: "إطلاق الإنذار" }, { id: "b", text: "تصوير الموقع" }], correct: ["a"], explanation: "الإنذار أولاً", points: 2, time_limit: 30, difficulty: "easy", ...extra,
});

await test("create bank questions with domain / specialty / topic / tags", async () => {
  const r = await A.post("/api/bank", { ...mcq("ما أول إجراء عند اكتشاف حريق؟"), domain: "الأمن والسلامة", specialty: "الحماية من الحريق", topic: "الإخلاء", tags: ["حريق", "إنذار", "حريق", " #طوارئ "] });
  ok(r);
  X.fire = r.data.id;
  const q = (await A.get(`/api/bank/${X.fire}`)).data;
  assert.deepEqual(q.tags, ["إنذار", "حريق", "طوارئ"].sort((a, b) => a.localeCompare(b)), "deduplicated, cleaned");
  assert.equal(q.domain, "الأمن والسلامة");
  assert.equal(q.version, 1);
  X.crowd = (await A.post("/api/bank", { type: "tf", title: "يجوز قفل مخارج الطوارئ أثناء الفعالية", correct: ["false"], domain: "الأمن والسلامة", specialty: "إدارة الحشود", topic: "المخارج", difficulty: "medium", tags: ["حشود", "طوارئ"] })).data.id;
  X.order = (await A.post("/api/bank", { type: "order", title: "رتّب خطوات الإخلاء", options: [{ id: "s1", text: "الإنذار" }, { id: "s2", text: "التوجه للمخرج" }, { id: "s3", text: "نقطة التجمع" }], domain: "الأمن والسلامة", specialty: "إدارة الحشود", topic: "الإخلاء", difficulty: "advanced", tags: ["حشود"] })).data.id;
  X.cyber = (await A.post("/api/bank", { type: "short", title: "ما اسم هجوم انتحال البريد؟", correct: ["التصيد"], domain: "الأمن السيبراني", specialty: "التوعية", topic: "الهندسة الاجتماعية", tags: ["بريد"] })).data.id;
  ok(await A.post("/api/bank", { type: "mcq", title: "بلا خيار صحيح", options: [{ id: "a", text: "1" }, { id: "b", text: "2" }], correct: [] }), 400, "validation");
});

await test("search by title or keywords — Arabic-normalised, all words must match", async () => {
  assert.deepEqual(ids(await A.get(`/api/bank?q=${encodeURIComponent("حريق")}`)), [X.fire]);
  assert.deepEqual(ids(await A.get(`/api/bank?q=${encodeURIComponent("الاخلاء")}`)), [X.fire, X.order].sort((a, b) => a - b), "hamza-insensitive (الإخلاء)");
  assert.deepEqual(ids(await A.get(`/api/bank?q=${encodeURIComponent("تصوير")}`)), [X.fire], "matches option text");
  assert.deepEqual(ids(await A.get(`/api/bank?q=${encodeURIComponent("التصيد")}`)), [X.cyber], "matches accepted answer");
  assert.deepEqual(ids(await A.get(`/api/bank?q=${encodeURIComponent("طوارئ مخارج")}`)), [X.crowd], "multi-word AND (tag + title)");
  assert.equal((await A.get(`/api/bank?q=${encodeURIComponent("100%_")}`)).data.total, 0, "wildcards escaped");
});

await test("filter by domain, specialty, topic, difficulty, type and tags", async () => {
  assert.equal((await A.get(`/api/bank?domain=${encodeURIComponent("الأمن والسلامة")}`)).data.total, 3);
  assert.deepEqual(ids(await A.get(`/api/bank?specialty=${encodeURIComponent("إدارة الحشود")}&topic=${encodeURIComponent("الإخلاء")}`)), [X.order]);
  assert.deepEqual(ids(await A.get(`/api/bank?difficulty=medium`)), [X.crowd]);
  assert.deepEqual(ids(await A.get(`/api/bank?type=short`)), [X.cyber]);
  assert.deepEqual(ids(await A.get(`/api/bank?tag=${encodeURIComponent("حشود")}&tag=${encodeURIComponent("طوارئ")}`)), [X.crowd], "tags are AND-ed");
  const f = (await A.get("/api/bank/facets")).data;
  assert.equal(f.domains.find((x) => x.value === "الأمن والسلامة").count, 3);
  assert.equal(f.tags.find((x) => x.value === "حشود").count, 2);
  assert.equal(f.counts.active, 4);
});

await test("bulk tagging", async () => {
  ok(await A.post("/api/bank/bulk", { ids: [X.fire, X.cyber], action: "add_tag", tag: "مراجعة 2026" }));
  assert.deepEqual(ids(await A.get(`/api/bank?tag=${encodeURIComponent("مراجعة 2026")}`)), [X.fire, X.cyber].sort((a, b) => a - b));
  assert.deepEqual(ids(await A.get(`/api/bank?q=${encodeURIComponent("مراجعه")}`)), [X.fire, X.cyber].sort((a, b) => a - b), "tags are searchable");
});

await test("import into a NEW activity, and copy into another course's activity", async () => {
  X.c1 = (await A.post("/api/courses", { title: "دورة السلامة" })).data.id;
  X.c2 = (await A.post("/api/courses", { title: "دورة الحشود" })).data.id;
  const r = await A.post("/api/bank/import", { ids: [X.fire, X.crowd, X.order], new_activity: { course_id: X.c1, title: "اختبار من المكتبة" } });
  ok(r);
  X.a1 = r.data.activity_id;
  const live = (await A.get(`/api/activities/${X.a1}/live`)).data;
  assert.equal(live.questions.length, 3);
  X.aq1 = r.data.created[0];
  const copy = (await A.get(`/api/questions/${X.aq1}`)).data;
  assert.equal(copy.bank_id, X.fire);
  assert.equal(copy.bank_version, 1);
  assert.equal(copy.title, "ما أول إجراء عند اكتشاف حريق؟");
  // existing activity in another course
  X.a2 = (await A.post("/api/activities", { course_id: X.c2, title: "نشاط الحشود" })).data.id;
  const r2 = await A.post("/api/bank/import", { ids: [X.fire], activity_id: X.a2 });
  ok(r2);
  X.aq2 = r2.data.created[0];
  assert.equal((await A.get(`/api/bank/${X.fire}`)).data.usage, 2);
  assert.equal((await A.get(`/api/bank/${X.fire}`)).data.used_in.length, 2);
});

await test("editing a bank question creates a new version and does NOT change activity copies", async () => {
  const cur = (await A.get(`/api/bank/${X.fire}`)).data;
  ok(await A.patch(`/api/bank/${X.fire}`, { ...cur, title: "ما أول إجراء عند ملاحظة حريق؟", correct: ["b"] }));
  const after = (await A.get(`/api/bank/${X.fire}`)).data;
  assert.equal(after.version, 2);
  const copy = (await A.get(`/api/questions/${X.aq1}`)).data;
  assert.equal(copy.title, "ما أول إجراء عند اكتشاف حريق؟", "activity copy unchanged");
  assert.deepEqual(copy.correct, ["a"]);
  // classification-only changes don't bump the version
  ok(await A.patch(`/api/bank/${X.fire}`, { ...after, topic: "الإنذار" }));
  assert.equal((await A.get(`/api/bank/${X.fire}`)).data.version, 2);
  // restore correct answer for the next tests
  ok(await A.patch(`/api/bank/${X.fire}`, { ...after, correct: ["a"] }));
  assert.equal((await A.get(`/api/bank/${X.fire}`)).data.version, 3);
});

await test("past answers and reports are untouched when the asked question is edited or deleted", async () => {
  ok(await A.post(`/api/activities/${X.a1}/control`, { action: "start" }));
  ok(await A.post(`/api/activities/${X.a1}/control`, { action: "open" }));
  const code = (await A.get(`/api/activities/${X.a1}/live`)).data.activity.join_code;
  ok(await T.post(`/api/play/${code}/join`, { name: "متدرب", trainee_number: "1" }));
  ok(await T.post(`/api/play/${code}/answer`, { question_id: X.aq1, answer: { choice: "a" } }));
  ok(await A.post(`/api/activities/${X.a1}/control`, { action: "end" }));
  const before = await A.get(`/api/export/activity/${X.a1}`);
  ok(before);
  // edit the activity question after it was answered: new text, new correct answer, new points
  const q = (await A.get(`/api/questions/${X.aq1}`)).data;
  ok(await A.patch(`/api/questions/${X.aq1}`, { ...q, title: "نص جديد بالكامل", options: [{ id: "a", text: "خيار جديد" }, { id: "b", text: "آخر" }], correct: ["b"], points: 10 }));
  const after = await A.get(`/api/export/activity/${X.a1}`);
  const read = async (buf) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const p = wb.worksheets[1].getRow(2).values.slice(1);
    const qrow = wb.worksheets[2].getRow(2).values.slice(1);
    return { p, qrow };
  };
  const b = await read(before.data), a = await read(after.data);
  assert.deepEqual(a.p, b.p, "participant score row unchanged");
  assert.deepEqual(a.qrow, b.qrow, "question row unchanged (title, correct answer)");
  assert.equal(a.qrow[1], "ما أول إجراء عند اكتشاف حريق؟");
  assert.equal(a.p[6], "2 / 2", "score out of the ORIGINAL points");
  // trainer re-grades: uses original points
  const live = (await A.get(`/api/activities/${X.a1}/live`)).data;
  // delete the asked question → hidden from the activity, still in the report
  ok(await A.del(`/api/questions/${X.aq1}`));
  assert.equal((await A.get(`/api/activities/${X.a1}/live`)).data.questions.length, live.questions.length - 1);
  ok(await A.get(`/api/questions/${X.aq1}`), 404, "deleted for editing");
  const del = await read((await A.get(`/api/export/activity/${X.a1}`)).data);
  assert.deepEqual(del.p, b.p, "report still has the answer after deletion");
  assert.deepEqual(del.qrow, b.qrow);
});

await test("activity copy can be updated to the latest bank version on demand", async () => {
  const copy = (await A.get(`/api/questions/${X.aq2}`)).data;
  assert.equal(copy.bank_version, 1);
  const r = await A.post(`/api/questions/${X.aq2}/sync`);
  ok(r);
  assert.equal(r.data.version, 3);
  const synced = (await A.get(`/api/questions/${X.aq2}`)).data;
  assert.equal(synced.title, "ما أول إجراء عند ملاحظة حريق؟");
  assert.equal(synced.bank_version, 3);
});

await test("save an existing activity question into the bank (linked)", async () => {
  const q = (await A.post("/api/questions", { activity_id: X.a2, type: "tf", title: "سؤال كتب داخل النشاط", correct: ["true"] })).data.id;
  const r = await A.post(`/api/questions/${q}/bank`, { domain: "الأمن والسلامة", topic: "عام", tags: ["جديد"] });
  ok(r);
  const linked = (await A.get(`/api/questions/${q}`)).data;
  assert.equal(linked.bank_id, r.data.bank_id);
  ok(await A.post(`/api/questions/${q}/bank`, {}), 409, "no duplicates");
  assert.equal((await A.get(`/api/bank/${r.data.bank_id}`)).data.title, "سؤال كتب داخل النشاط");
});

await test("archive: hidden from search & import, visible in the archive, restorable", async () => {
  ok(await A.patch(`/api/bank/${X.cyber}`, { status: "archived" }));
  assert.ok(!ids(await A.get("/api/bank")).includes(X.cyber));
  assert.deepEqual(ids(await A.get("/api/bank?status=archived")), [X.cyber]);
  ok(await A.post("/api/bank/import", { ids: [X.cyber], activity_id: X.a2 }), 409, "archived can't be imported");
  ok(await A.post("/api/bank/bulk", { ids: [X.cyber], action: "restore" }));
  assert.ok(ids(await A.get("/api/bank")).includes(X.cyber));
  ok(await A.post("/api/bank/bulk", { ids: [X.order, X.crowd], action: "archive" }));
  assert.equal((await A.get("/api/bank/facets")).data.counts.archived, 2);
});

await test("delete only unused questions (used ones must be archived)", async () => {
  ok(await A.del(`/api/bank/${X.fire}`), 409);
  ok(await A.del(`/api/bank/${X.cyber}`));
  ok(await A.get(`/api/bank/${X.cyber}`), 404);
});

await test("the bank is private to its trainer", async () => {
  assert.equal((await B.get("/api/bank")).data.total, 0);
  assert.equal((await B.get("/api/bank/facets")).data.tags.length, 0);
  for (const [m, p, body] of [
    ["GET", `/api/bank/${X.fire}`], ["PATCH", `/api/bank/${X.fire}`, { status: "archived" }], ["DELETE", `/api/bank/${X.order}`],
    ["POST", "/api/bank/bulk", { ids: [X.fire], action: "archive" }], ["POST", "/api/bank/import", { ids: [X.fire], activity_id: X.a2 }],
    ["POST", `/api/questions/${X.aq2}/sync`], ["POST", `/api/questions/${X.aq2}/bank`, {}],
  ]) ok(await B.req(m, p, body), 404, `${m} ${p}`);
  // B cannot import its own bank question into A's activity
  const mine = (await B.post("/api/bank", mcq("سؤال المدرب ب"))).data.id;
  ok(await B.post("/api/bank/import", { ids: [mine], activity_id: X.a2 }), 404);
  ok(await A.post("/api/bank/import", { ids: [mine], activity_id: X.a2 }), 404, "A can't import B's question");
  // trainees / anonymous
  for (const p of ["/api/bank", `/api/bank/${X.fire}`, "/api/bank/facets"]) ok(await T.get(p), 401, p);
});

console.log(results.join("\n"));
console.log(`\n${passed}/${results.length} question-bank scenarios passed`);
process.exit(process.exitCode ?? 0);
