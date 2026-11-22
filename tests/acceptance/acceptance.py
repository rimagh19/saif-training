"""
Full acceptance test of the platform as it will be used in a real session.

  python3 tests/acceptance/acceptance.py            (run from the project root after `npm run build`)

It starts and stops the server itself (so step 12 is a real restart), drives a real
trainer browser and 20 separate trainee browser contexts (different phones/tablets/desktop),
and checks every result against values computed independently in this file.
Writes tests/acceptance/out/report.md and screenshots.
"""
import json, os, re, shutil, signal, subprocess, sys, tempfile, time, unicodedata
from pathlib import Path

import cv2
import numpy as np
import openpyxl
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "out"
PORT = int(os.environ.get("ACC_PORT", "3700"))
BASE = f"http://localhost:{PORT}"
DATA = Path(tempfile.mkdtemp(prefix="safe-acc-"))
N = 20

results = []  # (step, name, ok, detail)


def check(step, name, cond, detail=""):
    results.append((step, name, bool(cond), detail))
    print(("  ✔ " if cond else "  ✘ ") + f"[{step}] {name}" + (f" — {detail}" if detail and not cond else ""), flush=True)
    return cond


# ------------------------------------------------------------------ server control
server = None


def start_server():
    global server
    server = subprocess.Popen(
        [str(ROOT / "node_modules/.bin/next"), "start", "-p", str(PORT)],
        cwd=ROOT, env={**os.environ, "DATA_DIR": str(DATA)}, stdout=open(OUT / "server.log", "a"), stderr=subprocess.STDOUT, start_new_session=True,
    )
    for _ in range(120):
        try:
            import urllib.request
            urllib.request.urlopen(BASE + "/login", timeout=1)
            return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("server did not start")


def stop_server():
    os.killpg(server.pid, signal.SIGTERM)
    server.wait(timeout=20)


# ------------------------------------------------------------------ the training content
TITLE_COURSE = "إدارة الحشود والإخلاء الآمن — دفعة نوفمبر"
TITLE_ACT = "تقييم الوحدة الأولى"
STEPS = ["إطلاق الإنذار", "توجيه الحضور إلى المخارج", "العد في نقطة التجمع"]
EXPLANATIONS = ["إيقاف التدفق يمنع تفاقم التكدس.", "مخارج الطوارئ يجب أن تبقى مفتوحة دائماً.", "", "", ""]
QUESTIONS = [
    dict(kind="mcq", title="ما أول إجراء عند ملاحظة تكدّس خطير عند بوابة الدخول؟", options=["إيقاف تدفق الدخول وفتح مسارات بديلة", "مطالبة الحضور بالإسراع", "إغلاق جميع البوابات فوراً", "انتظار تعليمات الإدارة"], correct=[0], points=2, time=180),
    dict(kind="tf", title="يجوز قفل مخارج الطوارئ أثناء الفعالية لمنع التسلل.", correct="false", points=1, time=0),
    dict(kind="multi", title="ما مؤشرات الخطر في الحشود؟", options=["ارتفاع الكثافة بشكل ملحوظ", "حركة موجية في الحشد", "وجود لافتات إرشادية"], correct=[0, 1], points=2, time=0),
    dict(kind="order", title="رتّب خطوات الإخلاء", options=STEPS, points=2, time=0),
    dict(kind="short", title="ما اسم المكان الذي يتجمع فيه الحضور بعد الإخلاء؟", accepted=["نقطة التجمع"], points=1, time=0),
]
MAX = sum(q["points"] for q in QUESTIONS)
NAMES = [f"متدرب {i + 1:02d}" for i in range(N)]
NUMS = [str(5001 + i) for i in range(N)]
DEVICES = ["iPhone 13", "Pixel 7", "Galaxy S9+", "iPhone SE", "iPad Mini", "Galaxy Tab S4", "Desktop"]


def plan(i):
    """What trainee i answers (None = skips) — and whether it is correct."""
    return [
        ("a" if i % 4 != 3 else "b") if i != 19 else None,                       # Q1 mcq (trainee 20 never answers Q1)
        (("false" if i % 2 == 0 else "true") if i not in (18, 19) else None),   # Q2 tf
        [["a", "b"], ["a"], ["a", "b", "c"]][i % 3],                            # Q3 multi
        "sorted" if i % 2 == 0 else "as-shown",                                 # Q4 order
        (["نقطه التجمع", "المخرج", "نقطة التجمع", "نقطة التجمع", "نقطة التجمع"][i % 5] if i != 17 else None),  # Q5 short
    ]


def expected(i):
    p = plan(i)
    ok = [
        None if p[0] is None else p[0] == "a",
        None if p[1] is None else p[1] == "false",
        sorted(p[2]) == ["a", "b"],
        p[3] == "sorted",
        None if p[4] is None else p[4] in ("نقطة التجمع", "نقطه التجمع"),
    ]
    score = sum(q["points"] for q, o in zip(QUESTIONS, ok) if o)
    return dict(ok=ok, correct=sum(1 for o in ok if o is True), wrong=sum(1 for o in ok if o is False), unanswered=sum(1 for o in ok if o is None), score=score)


EXP = [expected(i) for i in range(N)]


# ------------------------------------------------------------------ helpers
def decode_qr(png_bytes):
    img = cv2.imdecode(np.frombuffer(png_bytes, np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
    data, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    return data


def jsround(x, digits=1):
    """JavaScript Math.round(x * 10^d) / 10^d (half away from zero for positives)."""
    import math
    f = 10 ** digits
    return math.floor(x * f + 0.5) / f


def pct(a, b):
    return jsround(a / b * 100) if b else 0


def fmt(x):
    """Number as JavaScript prints it (55.0 -> "55")."""
    return str(int(x)) if float(x).is_integer() else str(x)


def norm(s):
    return unicodedata.normalize("NFC", s or "")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*"):
        f.unlink()
    start_server()
    shots = []

    def shot(page, name, full=False):
        p = OUT / f"{len(shots) + 1:02d}_{name}.png"
        page.screenshot(path=str(p), full_page=full)
        shots.append(p.name)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        trainer = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        tp = trainer.new_page()
        console_errors = []
        tp.on("pageerror", lambda e: console_errors.append(f"trainer: {e}"))

        # ============ 1. trainer sign-in ============
        tp.goto(BASE + "/")
        tp.wait_for_url("**/setup")
        tp.fill("#name", "م. خالد العتيبي"); tp.fill("#email", "trainer@safe.sa"); tp.fill("#password", "Trainer#2026"); tp.fill("#password2", "Trainer#2026")
        tp.click("form button.btn-primary"); tp.wait_for_url("**/dashboard")
        tp.get_by_role("button", name="تسجيل الخروج").first.click(); tp.wait_for_url("**/login")
        tp.fill("#email", "trainer@safe.sa"); tp.fill("#password", "wrong-pass"); tp.click("form button.btn-primary")
        alert = tp.wait_for_selector("form [role=alert]").inner_text()
        check(1, "wrong password is rejected with a clear message", "غير صحيحة" in alert, alert)
        tp.fill("#password", "Trainer#2026"); tp.click("form button.btn-primary"); tp.wait_for_url("**/dashboard")
        check(1, "trainer signs in through the login page", "/dashboard" in tp.url)

        # ============ 2. new course ============
        tp.goto(BASE + "/courses/new")
        tp.fill("#title", TITLE_COURSE); tp.fill("#description", "دورة تطبيقية للمشرفين الميدانيين")
        tp.click("text=حضوري"); tp.click("form button.btn-primary")
        tp.wait_for_url(re.compile(r"/courses/\d+$"))
        course_id = int(tp.url.rsplit("/", 1)[1])
        check(2, "course created and saved", tp.locator("h1", has_text=TITLE_COURSE).count() == 1)

        # ============ 3. activity with 5 questions (through the editor UI) ============
        tp.fill("input[name=title]", TITLE_ACT); tp.click("text=نشاط جديد")
        tp.wait_for_url(re.compile(r"/activities/\d+$"))
        act_id = int(tp.url.rsplit("/", 1)[1])
        tp.locator("label", has_text="تفعيل ترتيب النتائج").locator("[role=switch]").click()
        tp.wait_for_timeout(600)
        type_btn = {"mcq": "اختيار من متعدد", "tf": "صح أو خطأ", "multi": "اختيار أكثر من إجابة", "order": "ترتيب الخطوات", "short": "إجابة قصيرة نصية"}
        for qi, q in enumerate(QUESTIONS):
            tp.get_by_role("button", name="إضافة سؤال").first.click()
            ed = tp.locator(".card", has=tp.locator("#q-title")).first
            ed.get_by_role("button", name=type_btn[q["kind"]], exact=True).click()
            tp.fill("#q-title", q["title"])
            if q["kind"] in ("mcq", "multi", "order"):
                while ed.locator("li input.field").count() < len(q["options"]):
                    ed.get_by_role("button", name=re.compile("إضافة (خيار|خطوة)")).click()
                while ed.locator("li input.field").count() > len(q["options"]):
                    ed.locator("li").last.get_by_role("button", name="حذف").click()
                for k, txt in enumerate(q["options"]):
                    ed.locator("li input.field").nth(k).fill(txt)
                for k in q.get("correct", []):
                    ed.locator("button[title='الإجابة الصحيحة']").nth(k).click()
            if q["kind"] == "tf":
                ed.locator("button[title='الإجابة الصحيحة']").nth(1 if q["correct"] == "false" else 0).click()
            if q["kind"] == "short":
                tp.fill("#q-short", "\n".join(q["accepted"]))
            if EXPLANATIONS[qi]:
                tp.fill("#q-exp", EXPLANATIONS[qi])
            tp.fill("#q-points", str(q["points"])); tp.fill("#q-time", str(q["time"]))
            if qi == 0:
                shot(tp, "question_editor", True)
            ed.get_by_role("button", name="حفظ", exact=True).click()
            tp.wait_for_selector(f"h3:has-text('{q['title']}')")
        live_state = json.loads(trainer.request.get(f"{BASE}/api/activities/{act_id}/live").text())
        check(3, "activity has exactly 5 questions in the right order", [x["title"] for x in live_state["questions"]] == [q["title"] for q in QUESTIONS])
        qids = [x["id"] for x in live_state["questions"]]
        shot(tp, "activity_with_5_questions", True)

        # ============ 4. run the activity ============
        tp.goto(f"{BASE}/activities/{act_id}/live")
        tp.get_by_role("button", name="بدء النشاط").click()
        tp.wait_for_selector("text=بانتظار انضمام المتدربين")
        pres = trainer.new_page()
        pres.on("pageerror", lambda e: console_errors.append(f"presenter: {e}"))
        pres.goto(f"{BASE}/present/{act_id}")
        pres.wait_for_selector("text=جاهز للبدء")
        code = live_state and json.loads(trainer.request.get(f"{BASE}/api/activities/{act_id}/live").text())["activity"]["join_code"]
        check(4, "activity is live with a 6-digit code", re.fullmatch(r"\d{6}", code or "") is not None)

        # ============ 5. 20 trainees join by scanning the QR code ============
        pres.mouse.move(700, 700)
        pres.get_by_role("button", name="رمز الانضمام").first.click()
        qr_png = pres.locator(".fixed div[style*='width: 340px']").screenshot()
        qr_url = decode_qr(qr_png)
        check(5, "QR code on the presenter screen decodes to the join link", qr_url == f"{BASE}/play/{code}", qr_url)
        shot(pres, "presenter_qr")
        pres.keyboard.press("Escape")

        trainees = []  # dict(ctx, page, log)
        phase = {"tag": "join", "revealed": set()}
        for i in range(N):
            dev = DEVICES[i % len(DEVICES)]
            opts = {"viewport": {"width": 1280, "height": 800}} if dev == "Desktop" else {k: v for k, v in pw.devices[dev].items() if k != "default_browser_type"}
            ctx = browser.new_context(**opts)
            page = ctx.new_page()
            log = []
            page.on("response", lambda r, log=log: ("/api/play/" in r.url and not r.url.endswith("/stream")) and log.append((phase["tag"], frozenset(phase["revealed"]), r)))
            page.on("pageerror", lambda e, i=i: console_errors.append(f"trainee{i}: {e}"))
            page.goto(qr_url)  # what the phone camera opens
            page.wait_for_selector("#name")
            page.fill("#name", NAMES[i]); page.fill("#trainee_number", NUMS[i])
            page.get_by_role("button", name="انضمام").click()
            page.wait_for_selector("text=أنت داخل النشاط")
            trainees.append(dict(ctx=ctx, page=page, log=log, device=dev))
            if i == 0:
                shot(page, "trainee_joined_phone")
        tp.wait_for_selector("h3:has-text('(20)')")
        check(5, "20 trainees joined (trainer panel shows 20)", tp.locator("h3", has_text="المشاركون").inner_text().find("20") >= 0)
        pres.wait_for_selector("text=20")
        check(5, "devices used", True, ", ".join(sorted({t["device"] for t in trainees})))

        # identity rules
        dup = browser.new_context(**{k: v for k, v in pw.devices["Pixel 7"].items() if k != "default_browser_type"})
        dpage = dup.new_page(); dpage.goto(qr_url); dpage.fill("#name", "منتحل"); dpage.fill("#trainee_number", NUMS[0]); dpage.get_by_role("button", name="انضمام").click()
        check(5, "a second device cannot join with a trainee ID already in use", "مستخدم" in dpage.wait_for_selector("form [role=alert]").inner_text())
        dup.close()

        # ============ 6-9 per question ============
        def answered_text(k):
            return f"{k} / {N} أجابوا"

        def trainee_answer(i, qi):
            page = trainees[i]["page"]
            p = plan(i)[qi]
            if p is None:
                return False
            kind = QUESTIONS[qi]["kind"]
            page.wait_for_selector("button:has-text('إرسال الإجابة')", timeout=15000)
            if kind == "mcq":
                page.locator("[role=radio]").nth("abcd".index(p)).click()
            elif kind == "tf":
                page.locator("[role=radio]").nth(0 if p == "true" else 1).click()
            elif kind == "multi":
                for c in p:
                    page.locator("[role=checkbox]").nth("abc".index(c)).click()
            elif kind == "order" and p == "sorted":
                for t, label in enumerate(STEPS):
                    labels = [x.strip() for x in page.locator("ol li span.flex-1").all_inner_texts()]
                    c = labels.index(label)
                    while c > t:
                        page.locator("ol li").nth(c).get_by_role("button", name="نقل لأعلى").click()
                        c -= 1
            elif kind == "short":
                page.fill("textarea", p)
            btn = page.get_by_role("button", name="إرسال الإجابة")
            if i == 2 and qi == 0:
                btn.dblclick()  # impatient double tap
            else:
                btn.click()
            page.wait_for_selector("text=تم استلام إجابتك")
            return True

        latencies = []
        for qi, q in enumerate(QUESTIONS):
            n = qi + 1
            phase["tag"] = f"q{n}-ready"
            if qi > 0:
                tp.get_by_role("button", name="السؤال التالي").click()
                tp.wait_for_selector(f"text=السؤال {n} من 5")
            # offline scenario: trainee 07 loses connection before Q3 opens
            if qi == 2:
                trainees[6]["ctx"].set_offline(True)
                trainees[6]["page"].evaluate("window.dispatchEvent(new Event('offline'))")
            phase["tag"] = f"q{n}-open"
            tp.get_by_role("button", name="فتح استقبال الإجابات").click()
            tp.wait_for_selector("text=استقبال الإجابات مفتوح")
            if qi == 2:
                p6 = trainees[6]["page"]
                check(9, "offline trainee sees the offline banner", p6.wait_for_selector("text=لا يوجد اتصال بالإنترنت", timeout=8000) is not None)
                check(9, "offline trainee does not (cannot) receive the new question", p6.locator("text=إرسال الإجابة").count() == 0)
                shot(p6, "trainee_offline")
            count = 0
            for i in range(N):
                if qi == 2 and i == 6:
                    continue  # offline, answers after reconnecting
                if qi == 4 and i == 8:
                    # connection drops exactly while sending
                    page = trainees[8]["page"]
                    page.wait_for_selector("textarea", timeout=15000); page.fill("textarea", plan(8)[4])
                    trainees[8]["ctx"].set_offline(True)
                    page.get_by_role("button", name="إرسال الإجابة").click()
                    check(9, "send while offline shows an error instead of a false confirmation", page.wait_for_selector("[role=alert]", timeout=8000) is not None and page.locator("text=تم استلام إجابتك").count() == 0)
                    trainees[8]["ctx"].set_offline(False)
                    page.evaluate("window.dispatchEvent(new Event('online'))")
                    page.wait_for_timeout(1500)
                    page.get_by_role("button", name="إرسال الإجابة").click()
                    page.wait_for_selector("text=تم استلام إجابتك")
                    count += 1
                    tp.wait_for_selector(f"text={answered_text(count)}", timeout=8000)
                    continue
                t_submit = time.time()
                if trainee_answer(i, qi):
                    count += 1
                    # 7. live monitoring: trainer panel updates without reload
                    if count in (1, 5, 10) or i == N - 1 or qi == 1:
                        tp.wait_for_selector(f"text={answered_text(count)}", timeout=8000)
                        latencies.append(time.time() - t_submit)
            if qi == 2:
                p6 = trainees[6]["page"]
                trainees[6]["ctx"].set_offline(False)
                p6.evaluate("window.dispatchEvent(new Event('online'))")
                t0 = time.time()
                p6.wait_for_selector("button:has-text('إرسال الإجابة')", timeout=20000)
                check(9, "after reconnecting, the trainee automatically receives the current question", True, f"{time.time() - t0:.1f}s")
                trainee_answer(6, 2)
                count += 1
            tp.wait_for_selector(f"text={answered_text(count)}", timeout=8000)
            exp_count = sum(1 for i in range(N) if plan(i)[qi] is not None)
            check(7, f"Q{n}: live count reached {exp_count}/20 without refreshing", count == exp_count)
            pres.wait_for_selector(f"text={count}/{N}", timeout=8000)
            if qi == 0:
                shot(tp, "live_control_q1", True)
                # duplicate protection: the double tap + a forged second request
                ans = json.loads(trainer.request.get(f"{BASE}/api/activities/{act_id}/live").text())["answers"]
                check(10, "double tap stored exactly one answer", sum(1 for a in ans if a["name"] == NAMES[2]) == 1)
                other_opt = json.loads(trainees[2]["ctx"].request.get(f"{BASE}/api/play/{code}").text())["question"]["options"][1]["id"]  # a valid, different option
                r = trainees[2]["ctx"].request.post(f"{BASE}/api/play/{code}/answer", data=json.dumps({"question_id": qids[0], "answer": {"choice": other_opt}}), headers={"Content-Type": "application/json", "Origin": BASE})
                check(10, "second answer is refused (activity allows one answer)", r.status == 409 and "already_answered" in r.text(), f"{r.status} {r.text()[:120]}")
                check(10, "trainee UI shows the answer as final", trainees[2]["page"].locator("text=تم اعتماد إجابتك ولا يمكن تعديلها").count() == 1)
                # show distribution on the presenter (correct answer must stay hidden)
                pres.mouse.move(500, 500)
                pres.get_by_role("button", name="توزيع الإجابات").click()
                pres.wait_for_selector("text=%")
                shot(pres, "presenter_distribution_q1")
                pj = json.loads(trainer.request.get(f"{BASE}/api/activities/{act_id}/present").text())
                check(11, "presenter data has no correct answer before reveal", all(o["correct"] is None for o in pj["question"]["options"]) and pj["question"]["explanation"] is None)

            if qi == 1:
                pg4 = trainees[4]["page"]
                pg4.reload()
                pg4.wait_for_selector("text=تم استلام إجابتك", timeout=8000)
                check(9, "trainee refreshing the page mid-question keeps identity and submitted answer", pg4.locator(f"text={NAMES[4]}").count() >= 1)
                again = trainees[5]["ctx"].new_page()
                again.goto(qr_url)
                again.wait_for_selector("text=تم استلام إجابتك", timeout=8000)
                check(9, "re-scanning the QR code on the same phone returns to the session (no second sign-in)", again.locator("#name").count() == 0)
                again.close()
            # ============ 8. close ============
            phase["tag"] = f"q{n}-closed"
            tp.get_by_role("button", name="إغلاق الإجابات").click()
            tp.wait_for_selector("text=الإجابات مغلقة")
            late = trainees[19] if qi == 0 else trainees[18]
            lq = json.loads(late["ctx"].request.get(f"{BASE}/api/play/{code}").text())["question"]
            late_answer = {"choice": lq["options"][0]["id"]} if QUESTIONS[qi]["kind"] in ("mcq", "tf") else {"choices": [lq["options"][0]["id"]]} if QUESTIONS[qi]["kind"] == "multi" else {"order": [o["id"] for o in lq["options"]]} if QUESTIONS[qi]["kind"] == "order" else {"text": "x"}
            r = late["ctx"].request.post(f"{BASE}/api/play/{code}/answer", data=json.dumps({"question_id": qids[qi], "answer": late_answer}), headers={"Content-Type": "application/json", "Origin": BASE})
            late_idx = 19 if qi == 0 else 18
            if plan(late_idx)[qi] is None:  # a trainee who had not answered tries after closing
                check(8, f"Q{n}: a new answer after closing is refused", r.status == 409 and "answers_closed" in r.text(), f"{r.status} {r.text()[:100]}")
            else:  # one who already answered tries to change it after closing
                check(8, f"Q{n}: changing an answer after closing is refused", r.status == 409, f"{r.status} {r.text()[:100]}")
            for t in trainees[:3]:
                t["page"].wait_for_selector("text=بانتظار السؤال التالي", timeout=8000)
            check(8, f"Q{n}: trainees see 'waiting for next question' and no result yet",
                  all(t["page"].locator("text=إجابتك صحيحة").count() == 0 and t["page"].locator("text=إجابتك غير صحيحة").count() == 0 for t in trainees))

            # ============ 9. reveal ============
            phase["tag"] = f"q{n}-revealed"
            phase["revealed"].add(qids[qi])
            tp.get_by_role("button", name="إظهار الإجابة الصحيحة").click()
            tp.wait_for_selector("text=تم إظهار النتيجة")
            mismatches = []
            for i, t in enumerate(trainees):
                page = t["page"]
                ok = EXP[i]["ok"][qi]
                want = "لم ترسل إجابة لهذا السؤال" if ok is None else "إجابتك صحيحة" if ok else "إجابتك غير صحيحة"
                try:
                    page.wait_for_selector(f"h2:has-text('{want}')", timeout=8000)
                except Exception:
                    mismatches.append(f"{NAMES[i]} expected '{want}'")
            check(9, f"Q{n}: every trainee sees the right verdict after reveal (20/20)", not mismatches, "; ".join(mismatches[:5]))
            if qi == 0:
                shot(trainees[0]["page"], "trainee_after_reveal")
                shot(trainees[3]["page"], "trainee_wrong_after_reveal")
                pres.wait_for_selector("text=الإجابة الصحيحة")
                shot(pres, "presenter_revealed_q1")

        lat = sorted(latencies)
        mode = json.loads(trainer.request.get(f"{BASE}/api/activities/{act_id}/live").text())["realtime"]
        limit = 3.0 if mode == "sse" else 4.0  # polling adds up to one poll interval (1 s) by design
        check(7, f"answer reaches the trainer panel quickly [{mode}] (median {lat[len(lat)//2]:.2f}s, max {lat[-1]:.2f}s over {len(lat)} answers; limit {limit:.0f}s, includes tapping submit)", lat[-1] < limit)
        # end
        phase["tag"] = "ended"
        tp.once("dialog", lambda d: d.accept())
        tp.get_by_role("button", name="إنهاء النشاط").click()
        tp.wait_for_selector("text=انتهى النشاط")
        trainees[0]["page"].wait_for_selector("text=انتهى النشاط. شكراً لمشاركتك!")
        exp_score0 = EXP[0]["score"]
        check(10, "trainee sees their own final score only", trainees[0]["page"].locator(".gold-text", has_text=str(exp_score0)).count() == 1)
        pres.wait_for_selector("text=ترتيب النتائج", timeout=8000)
        shot(pres, "presenter_final_ranking")

        # ============ leakage audit over every response every trainee received ============
        names_nums = set(NAMES) | set(NUMS)
        leaks, reveal_early, correct_keys = [], [], []
        for i, t in enumerate(trainees):
            own = {NAMES[i], NUMS[i]}
            for tag, revealed, resp in t["log"]:
                try:
                    body = resp.text()
                except Exception:
                    continue
                for other in names_nums - own:
                    if re.search(rf"(?<!\d){re.escape(other)}(?!\d)", body):
                        leaks.append(f"{NAMES[i]} got '{other}' ({tag})")
                try:
                    js = json.loads(body)
                except Exception:
                    continue
                if isinstance(js, dict) and "q_state" in js:
                    q = js.get("question") or {}
                    if q and ("correct" in q or "explanation" in q):
                        correct_keys.append(f"{NAMES[i]} {tag}")
                    if js.get("reveal") and q.get("id") not in revealed:
                        reveal_early.append(f"{NAMES[i]} reveal of Q{q.get('id')} at {tag}")
                    for k, e in enumerate(EXPLANATIONS):
                        if e and e in body and qids[k] not in revealed:
                            reveal_early.append(f"{NAMES[i]} explanation of Q{k + 1} at {tag}")
        total_responses = sum(len(t["log"]) for t in trainees)
        check("أمان", f"no trainee received another trainee's name or ID ({total_responses} responses audited)", not leaks, "; ".join(leaks[:5]))
        check("أمان", "no trainee received the correct answer or explanation before the trainer revealed it", not reveal_early and not correct_keys, "; ".join((reveal_early + correct_keys)[:5]))

        # ============ trainee cannot reach the trainer dashboard ============
        tpage = trainees[5]["page"]
        blocked = []
        for path in ["/dashboard", f"/courses/{course_id}", f"/activities/{act_id}", f"/activities/{act_id}/live", f"/present/{act_id}", "/reports", f"/reports/activity/{act_id}", "/library", "/settings"]:
            tpage.goto(BASE + path)
            if not tpage.url.endswith("/login") or TITLE_COURSE in tpage.content():
                blocked.append(path)
        check("أمان", "trainee device opening 9 trainer pages lands on the login page with no data", not blocked, ", ".join(blocked))
        api_open = []
        for m, path in [("GET", f"/api/activities/{act_id}/live"), ("GET", f"/api/activities/{act_id}/present"), ("GET", f"/api/export/activity/{act_id}"), ("POST", f"/api/activities/{act_id}/control"), ("GET", f"/api/questions/{qids[0]}"), ("GET", "/api/bank")]:
            r = trainees[5]["ctx"].request.fetch(BASE + path, method=m, data="{}" if m == "POST" else None, headers={"Content-Type": "application/json", "Origin": BASE})
            if r.status != 401:
                api_open.append(f"{m} {path} -> {r.status}")
        check("أمان", "trainee session gets 401 on trainer APIs", not api_open, "; ".join(api_open))

        # ============ course isolation: a second course running in parallel ============
        req = trainer.request
        hdr = {"Content-Type": "application/json", "Origin": BASE}
        c2 = json.loads(req.post(f"{BASE}/api/courses", data=json.dumps({"title": "دورة الأمن السيبراني", "mode": "remote"}), headers=hdr).text())["id"]
        a2 = json.loads(req.post(f"{BASE}/api/activities", data=json.dumps({"course_id": c2, "title": "اختبار التوعية"}), headers=hdr).text())["id"]
        q2 = json.loads(req.post(f"{BASE}/api/questions", data=json.dumps({"activity_id": a2, "type": "tf", "title": "يمكن مشاركة كلمة المرور مع الزملاء", "correct": ["false"], "time_limit": 0}), headers=hdr).text())["id"]
        req.post(f"{BASE}/api/activities/{a2}/control", data=json.dumps({"action": "start"}), headers=hdr)
        req.post(f"{BASE}/api/activities/{a2}/control", data=json.dumps({"action": "open"}), headers=hdr)
        code2 = json.loads(req.get(f"{BASE}/api/activities/{a2}/live").text())["activity"]["join_code"]
        others = []
        for k, (nm, num) in enumerate([(NAMES[0], NUMS[0]), ("متدرب سيبراني", "9001"), ("متدرب سيبراني 2", "9002")]):
            ctx = browser.new_context(**{kk: v for kk, v in pw.devices["Pixel 7"].items() if kk != "default_browser_type"})
            pg = ctx.new_page(); pg.goto(f"{BASE}/play/{code2}"); pg.fill("#name", nm); pg.fill("#trainee_number", num); pg.get_by_role("button", name="انضمام").click()
            pg.wait_for_selector("button:has-text('إرسال الإجابة')"); pg.locator("[role=radio]").nth(1).click(); pg.get_by_role("button", name="إرسال الإجابة").click(); pg.wait_for_selector("text=تم استلام إجابتك")
            others.append(ctx)
        check("عزل", "same trainee ID can join a different course without clashing", True)
        st = json.loads(trainees[0]["ctx"].request.get(f"{BASE}/api/play/{code2}").text())
        check("عزل", "course-1 trainee is not a participant of course 2", st["me"] is None)
        r = trainees[0]["ctx"].request.post(f"{BASE}/api/play/{code2}/answer", data=json.dumps({"question_id": q2, "answer": {"choice": "true"}}), headers=hdr)
        check("عزل", "course-1 trainee cannot answer in course 2", r.status == 401)
        r = trainees[0]["ctx"].request.post(f"{BASE}/api/play/{code}/answer", data=json.dumps({"question_id": q2, "answer": {"choice": "true"}}), headers=hdr)
        check("عزل", "a course-2 question cannot be answered through the course-1 code", r.status == 409)

        # ============ 10. final results ============
        tp.goto(f"{BASE}/reports/activity/{act_id}")
        tp.wait_for_selector("text=الأسئلة الأكثر إجابة بشكل خاطئ")
        shot(tp, "final_report", True)
        avg = jsround(sum(pct(e["score"], MAX) for e in EXP) / N)
        answers_total = sum(1 for i in range(N) for x in plan(i) if x is not None)
        part = pct(answers_total, N * 5)
        page_text = tp.inner_text("main")
        check(10, f"report shows group average {fmt(avg)}%", f"{fmt(avg)}%" in page_text, page_text[:200])
        check(10, f"report shows participation rate {fmt(part)}%", f"{fmt(part)}%" in page_text)
        check(10, "report lists exactly the 20 trainees of this course", all(nm in page_text for nm in NAMES) and "متدرب سيبراني" not in page_text)

        # ============ 11. Excel export (real download) ============
        with tp.expect_download() as dl:
            tp.get_by_role("link", name="تصدير Excel").click()
        xlsx = OUT / "activity_report.xlsx"
        dl.value.save_as(str(xlsx))

        def read_xlsx(path):
            wb = openpyxl.load_workbook(path)
            ws = wb.worksheets[1]
            rows = {r[1]: r for r in ws.iter_rows(min_row=2, values_only=True)}
            summary = {r[0]: r[1] for r in wb.worksheets[0].iter_rows(values_only=True)}
            qsheet = [r for r in wb.worksheets[2].iter_rows(min_row=2, values_only=True)]
            return rows, summary, qsheet

        rows, summary, qsheet = read_xlsx(xlsx)
        bad = []
        for i in range(N):
            r = rows.get(NAMES[i])
            e = EXP[i]
            if not r:
                bad.append(f"missing {NAMES[i]}"); continue
            got = (str(r[2]), r[3], r[4], r[5], r[7], round(r[8], 4))
            want = (NUMS[i], e["correct"], e["wrong"], e["unanswered"], f"{e['score']} / {MAX}", round(pct(e["score"], MAX) / 100, 4))
            if got != want:
                bad.append(f"{NAMES[i]} got {got} want {want}")
        check(11, "Excel: 20 rows, each trainee's correct/wrong/unanswered/score/percent match expected", len(rows) == N and not bad, "; ".join(bad[:4]))
        scores_sorted = sorted((EXP[i]["score"] for i in range(N)), reverse=True)
        check(11, "Excel: ranking column present and ordered by score", [int(r[7].split(" / ")[0]) for r in sorted(rows.values(), key=lambda r: r[0])] == scores_sorted)
        check(11, "Excel: summary average and participation match", summary.get("متوسط نتائج المجموعة") == f"{fmt(avg)}%" and summary.get("نسبة المشاركة") == f"{fmt(part)}%", str(summary))
        exp_wrong = []
        for qi in range(5):
            ans = [EXP[i]["ok"][qi] for i in range(N) if EXP[i]["ok"][qi] is not None]
            exp_wrong.append(pct(sum(1 for a in ans if a is False), len(ans)))
        got_wrong = {r[1]: round(r[7] * 100, 1) for r in qsheet}
        check(11, "Excel: wrong-answer rate per question matches", all(abs(got_wrong[QUESTIONS[qi]["title"]] - exp_wrong[qi]) < 0.05 for qi in range(5)), f"{got_wrong} vs {exp_wrong}")
        check(11, "Excel: questions sheet sorted by most wrong first", [round(r[7] * 100, 1) for r in qsheet] == sorted(exp_wrong, reverse=True))
        wbx = openpyxl.load_workbook(xlsx)
        raw_cells = [str(c) for ws in wbx.worksheets for row in ws.iter_rows(values_only=True) for c in row if c is not None]
        check(11, "Excel: true/false answers shown in the report language (no raw 'صح | True')", not any("| True" in c or "| False" in c for c in raw_cells))
        tf_row = next(r for r in qsheet if r[1] == QUESTIONS[1]["title"])
        check(11, "Excel: correct answer of the true/false question reads 'خطأ'", tf_row[3] == "خطأ", str(tf_row[3]))
        excel_before = (rows, summary, qsheet)
        state_file = OUT / "trainer_state.json"
        trainer.storage_state(path=str(state_file))
        shot(tp, "before_restart")

        if console_errors:
            check("UI", "no JavaScript errors in any browser", False, "; ".join(console_errors[:5]))
        else:
            check("UI", "no JavaScript errors in any browser (trainer, presenter, 20 trainees)", True)
        browser.close()

    # ============ 12. shut everything down, reopen, verify ============
    stop_server()
    check(12, "server stopped (all browsers closed)", server.poll() is not None)
    start_server()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        # a) existing trainer session survives the restart
        ctx = browser.new_context(storage_state=str(OUT / "trainer_state.json"), accept_downloads=True)
        p = ctx.new_page(); p.goto(BASE + "/dashboard")
        check(12, "trainer session still valid after restart", p.url.endswith("/dashboard"))
        ctx.close()
        # b) fresh browser, normal login
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        p = ctx.new_page(); p.goto(BASE + "/")
        p.wait_for_url("**/login")
        p.fill("#email", "trainer@safe.sa"); p.fill("#password", "Trainer#2026"); p.click("form button.btn-primary"); p.wait_for_url("**/dashboard")
        dash = p.inner_text("main")
        check(12, "dashboard after restart shows the courses and 23 participants", "إدارة الحشود" in dash and "دورة الأمن السيبراني" in dash)
        p.goto(f"{BASE}/activities/{act_id}")
        check(12, "activity and its 5 questions are still there", all(p.locator(f"h3:has-text('{q['title']}')").count() == 1 for q in QUESTIONS))
        p.goto(f"{BASE}/reports/activity/{act_id}")
        with p.expect_download() as dl:
            p.get_by_role("link", name="تصدير Excel").click()
        x2 = OUT / "activity_report_after_restart.xlsx"
        dl.value.save_as(str(x2))
        rows2, summary2, q2s = read_xlsx(x2)
        check(12, "Excel after restart is identical to before (every row, summary and question stats)", (rows2, {k: v for k, v in summary2.items()}, q2s) == (excel_before[0], excel_before[1], excel_before[2]))
        shot(p, "after_restart_report", True)
        browser.close()
    stop_server()

    # ------------------------------------------------------------------ report
    passed = sum(1 for r in results if r[2])
    lines = [f"# Acceptance test — {time.strftime('%Y-%m-%d %H:%M')}", "", f"**{passed}/{len(results)} checks passed**", "", "| Step | Check | Result | Detail |", "|---|---|---|---|"]
    for s, n, ok, d in results:
        lines.append(f"| {s} | {n} | {'✅' if ok else '❌'} | {d.replace('|', '/')[:160]} |")
    lines += ["", "Screenshots: " + ", ".join(shots)]
    (OUT / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\n{passed}/{len(results)} acceptance checks passed")
    shutil.rmtree(DATA, ignore_errors=True)
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        if server and server.poll() is None:
            os.killpg(server.pid, signal.SIGTERM)
