import json, time, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3200"
SHOTS = "/home/claude/qa/shots"
errors = []

def watch(page, tag):
    page.on("console", lambda m: m.type == "error" and errors.append(f"[{tag}] console: {m.text}"))
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    tr = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = tr.new_page(); watch(page, "trainer")

    # first-run setup through the UI
    page.goto(BASE + "/"); page.wait_for_url("**/setup")
    page.screenshot(path=f"{SHOTS}/01_setup.png")
    page.fill("#name", "م. خالد العتيبي"); page.fill("#email", "khaled@safe.test")
    page.fill("#password", "Trainer#2026"); page.fill("#password2", "Trainer#2026")
    page.click("form button.btn-primary"); page.wait_for_url("**/dashboard")
    page.screenshot(path=f"{SHOTS}/02_dashboard_empty.png")

    # create course through the UI
    page.goto(BASE + "/courses/new")
    page.fill("#title", "إدارة الحشود والإخلاء الآمن")
    page.fill("#description", "دورة عملية في تنظيم الحشود وخطط الإخلاء في المنشآت الحيوية.")
    page.click("text=حضوري"); page.click("form button.btn-primary")
    import re
    page.wait_for_url(re.compile(r"/courses/\d+$")); course_url = page.url
    # new activity
    page.fill("input[name=title]", "تقييم الوحدة الأولى"); page.click("text=نشاط جديد")
    page.wait_for_url(re.compile(r"/activities/\d+$"))
    act_id = page.url.rstrip("/").split("/")[-1]
    page.click("text=إضافة سؤال >> nth=0")
    page.fill("#q-title", "ما أول إجراء عند ملاحظة تكدّس خطير عند بوابة الدخول؟")
    opts = page.locator("li input.field")
    opts.nth(0).fill("إيقاف تدفق الدخول وفتح مسارات بديلة")
    opts.nth(1).fill("مطالبة الحضور بالإسراع")
    opts.nth(2).fill("إغلاق جميع البوابات فوراً")
    page.locator("button[title='الإجابة الصحيحة']").first.click()
    page.fill("#q-exp", "إيقاف التدفق يمنع تفاقم التكدس، وفتح المسارات البديلة يوزع الضغط.")
    page.fill("#q-points", "2"); page.fill("#q-time", "30")
    page.screenshot(path=f"{SHOTS}/03_question_editor.png", full_page=True)
    page.click("text=حفظ >> nth=0")
    page.wait_for_selector("text=ما أول إجراء عند ملاحظة")

    # remaining questions via API using the trainer's session (same cookies)
    def api(method, path, body=None):
        r = page.request.fetch(BASE + path, method=method, data=json.dumps(body) if body is not None else None, headers={"Content-Type": "application/json", "Origin": BASE})
        assert r.ok, (path, r.status, r.text())
        return r.json()
    A = int(act_id)
    api("POST", "/api/questions", {"activity_id": A, "type": "tf", "title": "يجوز قفل مخارج الطوارئ أثناء الفعالية لمنع التسلل.", "correct": ["false"], "points": 1, "time_limit": 20, "difficulty": "easy", "explanation": "مخارج الطوارئ يجب أن تبقى متاحة دائماً."})
    api("POST", "/api/questions", {"activity_id": A, "type": "multi", "title": "ما مؤشرات الخطر في الحشود؟", "options": [{"id":"a","text":"ارتفاع الكثافة فوق 4 أشخاص/م²"},{"id":"b","text":"حركة موجية في الحشد"},{"id":"c","text":"وجود لافتات إرشادية"},{"id":"d","text":"صعوبة سماع التعليمات"}], "correct": ["a","b","d"], "points": 2, "time_limit": 45, "difficulty": "medium"})
    api("POST", "/api/questions", {"activity_id": A, "type": "scenario", "title": "سيناريو: إنذار حريق أثناء محاضرة", "body": "أثناء محاضرة يحضرها 300 شخص انطلق إنذار الحريق، ولاحظت أن أحد المخارج مزدحم بينما الآخر شبه فارغ.", "options": [{"id":"a","text":"توجيه الحضور صوتياً نحو المخرج الأقل ازدحاماً"},{"id":"b","text":"انتظار تأكيد وجود حريق فعلي"},{"id":"c","text":"فتح جميع النوافذ"}], "correct": ["a"], "points": 3, "time_limit": 60, "difficulty": "advanced"})
    api("POST", "/api/questions", {"activity_id": A, "type": "order", "title": "رتّب خطوات الإخلاء", "options": [{"id":"s1","text":"إطلاق الإنذار"},{"id":"s2","text":"توجيه الحضور إلى المخارج"},{"id":"s3","text":"التحقق من خلو المبنى"},{"id":"s4","text":"العد في نقطة التجمع"}], "points": 2, "time_limit": 60, "difficulty": "medium"})
    api("POST", "/api/questions", {"activity_id": A, "type": "short", "title": "ما اسم المكان الذي يتجمع فيه الحضور بعد الإخلاء؟", "correct": ["نقطة التجمع", "منطقة التجمع"], "points": 1, "time_limit": 30, "difficulty": "easy"})
    api("PATCH", f"/api/activities/{A}", {"show_leaderboard": True})
    page.reload(); page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{SHOTS}/04_activity_editor.png", full_page=True)

    # start live via UI
    page.goto(f"{BASE}/activities/{A}/live")
    page.click("text=بدء النشاط")
    page.wait_for_selector("text=انضموا", timeout=1) if False else page.wait_for_selector("text=المشاركون")
    code = api("GET", f"/api/activities/{A}/live")["activity"]["join_code"]

    # projector
    pres = tr.new_page(); watch(pres, "present")
    pres.goto(f"{BASE}/present/{A}"); pres.wait_for_timeout(800)
    pres.screenshot(path=f"{SHOTS}/05_present_join.png")

    # trainees on phones
    names = [("سارة القحطاني","2101","a"),("عبدالله الشهري","2102","b"),("ريم الدوسري","2103","a"),("ماجد الحربي","2104","a")]
    phones = []
    for i,(n,num,ans) in enumerate(names):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ph = ctx.new_page(); watch(ph, f"trainee{i}")
        ph.goto(f"{BASE}/join")
        if i == 0: ph.screenshot(path=f"{SHOTS}/06_trainee_join.png")
        ph.fill("input[inputmode=numeric]", code)
        ph.wait_for_url(f"**/play/{code}")
        ph.fill("#name", n); ph.fill("#trainee_number", num)
        if i == 0: ph.screenshot(path=f"{SHOTS}/07_trainee_identity.png")
        ph.click("text=انضمام"); ph.wait_for_selector("text=أنت داخل النشاط")
        if i == 0: ph.screenshot(path=f"{SHOTS}/08_trainee_waiting.png")
        phones.append((ph, ans))

    page.wait_for_timeout(600)
    # open Q1 via UI
    page.click("text=فتح استقبال الإجابات")
    for i,(ph,ans) in enumerate(phones):
        ph.wait_for_selector("text=إرسال الإجابة", timeout=8000)  # pushed via SSE, no reload
        if i == 0: ph.screenshot(path=f"{SHOTS}/09_trainee_question.png")
        idx = {"a":0,"b":1,"c":2}[ans]
        ph.locator("[role=radio]").nth(idx).click()
        ph.click("text=إرسال الإجابة"); ph.wait_for_selector("text=تم استلام إجابتك")
        if i == 0: ph.screenshot(path=f"{SHOTS}/10_trainee_received.png")
    page.wait_for_timeout(700)
    pres.wait_for_timeout(500)
    pres.screenshot(path=f"{SHOTS}/11_present_question.png")
    page.screenshot(path=f"{SHOTS}/12_live_control.png", full_page=True)
    page.click("text=إظهار الإجابة الصحيحة"); page.wait_for_timeout(900)
    pres.screenshot(path=f"{SHOTS}/13_present_reveal.png")
    phones[1][0].wait_for_selector("text=إجابتك غير صحيحة", timeout=8000)
    phones[1][0].screenshot(path=f"{SHOTS}/14_trainee_reveal_wrong.png")

    # order question on phone
    q_ids = [q["id"] for q in api("GET", f"/api/activities/{A}/live")["questions"]]
    api("POST", f"/api/activities/{A}/control", {"action": "goto", "questionId": q_ids[4]})
    api("POST", f"/api/activities/{A}/control", {"action": "open"})
    phones[0][0].wait_for_selector("text=رتّب الخطوات", timeout=8000)
    phones[0][0].screenshot(path=f"{SHOTS}/15_trainee_order.png")
    for ph,_ in phones[:3]:
        ph.click("text=إرسال الإجابة"); ph.wait_for_selector("text=تم استلام إجابتك")
    api("POST", f"/api/activities/{A}/control", {"action": "reveal"})
    # scenario
    api("POST", f"/api/activities/{A}/control", {"action": "goto", "questionId": q_ids[3]})
    api("POST", f"/api/activities/{A}/control", {"action": "open"})
    phones[2][0].wait_for_selector("text=سيناريو", timeout=8000)
    phones[2][0].screenshot(path=f"{SHOTS}/16_trainee_scenario.png", full_page=True)
    for i,(ph,_) in enumerate(phones):
        ph.locator("[role=radio]").nth(0 if i != 1 else 1).click(); ph.click("text=إرسال الإجابة"); ph.wait_for_selector("text=تم استلام إجابتك")
    api("POST", f"/api/activities/{A}/control", {"action": "reveal"})
    api("POST", f"/api/activities/{A}/control", {"action": "end"})
    pres.wait_for_timeout(900); pres.screenshot(path=f"{SHOTS}/17_present_ended.png")

    # reports & dashboard
    page.goto(f"{BASE}/reports/activity/{A}"); page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{SHOTS}/18_report.png", full_page=True)
    page.goto(f"{BASE}/dashboard"); page.screenshot(path=f"{SHOTS}/19_dashboard.png", full_page=True)
    page.goto(course_url); page.screenshot(path=f"{SHOTS}/20_course.png", full_page=True)
    page.goto(f"{BASE}/library"); page.screenshot(path=f"{SHOTS}/21_library.png", full_page=True)
    pp = tr.new_page(); pp.goto(f"{BASE}/print/activity/{A}"); pp.wait_for_timeout(300)
    pp.pdf(path=f"{SHOTS}/report.pdf", format="A4", landscape=True, print_background=True)
    # English + mobile trainer
    tr.add_cookies([{"name": "safe_lang", "value": "en", "url": BASE}])
    page.goto(f"{BASE}/dashboard"); page.screenshot(path=f"{SHOTS}/22_dashboard_en.png", full_page=True)
    m = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, storage_state=tr.storage_state())
    mp = m.new_page(); mp.goto(f"{BASE}/courses"); mp.screenshot(path=f"{SHOTS}/23_mobile_courses_en.png")
    b.close()

print("\n".join(errors) if errors else "no console errors")
