import json, re
from playwright.sync_api import sync_playwright
BASE="http://localhost:3400"; S="/home/claude/qa/mshots"
errors=[]
def watch(pg,tag):
    pg.on("console", lambda m: m.type=="error" and "ERR_INTERNET_DISCONNECTED" not in m.text and "Failed to fetch" not in m.text and errors.append(f"[{tag}] {m.text}"))
    pg.on("pageerror", lambda e: errors.append(f"[{tag}] {e}"))
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    tr=b.new_context(); rq=tr.request; H={"Content-Type":"application/json","Origin":BASE}
    def api(m,path,body=None):
        r=rq.fetch(BASE+path,method=m,data=json.dumps(body) if body is not None else None,headers=H)
        assert r.ok,(path,r.status,r.text()); return r.json()
    api("POST","/api/auth/setup",{"name":"م. خالد","email":"k@safe.test","password":"Trainer#2026"})
    c=api("POST","/api/courses",{"title":"إدارة الحشود والإخلاء الآمن","mode":"remote"})["id"]
    A=api("POST","/api/activities",{"course_id":c,"title":"تقييم الوحدة الأولى"})["id"]
    Q=[api("POST","/api/questions",{"activity_id":A,**q})["id"] for q in [
      {"type":"mcq","title":"ما أول إجراء عند ملاحظة تكدّس خطير عند بوابة الدخول؟","options":[{"id":"a","text":"إيقاف تدفق الدخول وفتح مسارات بديلة"},{"id":"b","text":"مطالبة الحضور بالإسراع"},{"id":"c","text":"إغلاق جميع البوابات فوراً"},{"id":"d","text":"انتظار تعليمات الإدارة"}],"correct":["a"],"explanation":"إيقاف التدفق يمنع تفاقم التكدس، وفتح المسارات البديلة يوزّع الضغط.","time_limit":30},
      {"type":"tf","title":"يجوز قفل مخارج الطوارئ أثناء الفعالية لمنع التسلل.","correct":["false"],"time_limit":20},
      {"type":"multi","title":"ما مؤشرات الخطر في الحشود؟","options":[{"id":"a","text":"ارتفاع الكثافة فوق 4 أشخاص/م²"},{"id":"b","text":"حركة موجية في الحشد"},{"id":"c","text":"وجود لافتات إرشادية"},{"id":"d","text":"صعوبة سماع التعليمات"}],"correct":["a","b","d"],"time_limit":45},
      {"type":"order","title":"رتّب خطوات الإخلاء","options":[{"id":"s1","text":"إطلاق الإنذار"},{"id":"s2","text":"توجيه الحضور إلى المخارج"},{"id":"s3","text":"التحقق من خلو المبنى"},{"id":"s4","text":"العدّ في نقطة التجمع"}],"time_limit":60},
      {"type":"short","title":"ما اسم المكان الذي يتجمع فيه الحضور بعد الإخلاء؟","correct":["نقطة التجمع"],"time_limit":0},
      {"type":"scenario","title":"سيناريو","body":"أثناء محاضرة يحضرها 300 شخص انطلق إنذار الحريق، ولاحظت أن أحد المخارج مزدحم بينما الآخر شبه فارغ. ماذا تفعل؟","options":[{"id":"a","text":"توجيه الحضور صوتياً نحو المخرج الأقل ازدحاماً"},{"id":"b","text":"انتظار تأكيد وجود حريق فعلي"}],"correct":["a"],"time_limit":3},
    ]]
    code=api("GET",f"/api/activities/{A}/live")["activity"]["join_code"]
    ph_ctx=b.new_context(viewport={"width":390,"height":844},device_scale_factor=2,is_mobile=True,has_touch=True,locale="ar")
    ph=ph_ctx.new_page(); watch(ph,"phone")
    def shot(n): ph.wait_for_timeout(450); ph.screenshot(path=f"{S}/{n}.png")
    # 1) code entry before start
    ph.goto(f"{BASE}/join"); shot("01_code_empty")
    ph.keyboard.type("12345"); shot("02_code_typing")
    ph.keyboard.type("9"); ph.wait_for_selector("[role=alert]"); shot("03_code_wrong")
    # QR link before activity starts
    ph.goto(f"{BASE}/play/{code}"); ph.wait_for_selector("text=النشاط لم يبدأ بعد"); shot("04_not_started")
    api("POST",f"/api/activities/{A}/control",{"action":"start"})
    ph.wait_for_selector("text=بياناتك",timeout=8000); shot("05_details")   # appeared without reload
    ph.fill("#name","سارة القحطاني"); ph.fill("#trainee_number","2101"); ph.click("text=انضمام")
    ph.wait_for_selector("text=أنت داخل النشاط"); shot("06_waiting_first")
    # 2) MCQ, single answer
    api("POST",f"/api/activities/{A}/control",{"action":"open"})
    ph.wait_for_selector("text=إرسال الإجابة",timeout=8000); shot("07_question")
    ph.locator("[role=radio]").nth(0).tap(); shot("08_selected")
    ph.click("text=إرسال الإجابة"); ph.wait_for_selector("text=تم استلام إجابتك"); shot("09_received_locked")
    assert ph.locator("text=تغيير الإجابة").count()==0
    api("POST",f"/api/activities/{A}/control",{"action":"close"}); ph.wait_for_selector("text=بانتظار السؤال التالي"); shot("10_closed_waiting_next")
    api("POST",f"/api/activities/{A}/control",{"action":"reveal"}); ph.wait_for_selector("text=إجابتك صحيحة"); shot("11_revealed")
    api("POST",f"/api/activities/{A}/control",{"action":"next"}); ph.wait_for_selector("text=بانتظار السؤال التالي"); shot("12_between_questions")
    # 3) TF
    api("POST",f"/api/activities/{A}/control",{"action":"open"}); ph.wait_for_selector("[role=radio]")
    ph.locator("[role=radio]").nth(1).tap(); shot("13_tf")
    ph.click("text=إرسال الإجابة"); ph.wait_for_selector("text=تم استلام إجابتك")
    # 4) multi with allow_change ON
    api("PATCH",f"/api/activities/{A}",{"allow_change":True})
    api("POST",f"/api/activities/{A}/control",{"action":"next"}); api("POST",f"/api/activities/{A}/control",{"action":"open"})
    ph.wait_for_selector("[role=checkbox]",timeout=8000)
    ph.locator("[role=checkbox]").nth(0).tap(); ph.locator("[role=checkbox]").nth(1).tap(); shot("14_multi")
    ph.click("text=إرسال الإجابة"); ph.wait_for_selector("text=تغيير الإجابة"); shot("15_received_changeable")
    ph.click("text=تغيير الإجابة"); ph.locator("[role=checkbox]").nth(3).tap(); ph.click("text=تحديث الإجابة"); ph.wait_for_selector("text=تم استلام إجابتك")
    api("PATCH",f"/api/activities/{A}",{"allow_change":False})
    # 5) order
    api("POST",f"/api/activities/{A}/control",{"action":"next"}); api("POST",f"/api/activities/{A}/control",{"action":"open"})
    ph.wait_for_selector("text=رتّب الخطوات بالتسلسل الصحيح",timeout=8000); shot("16_order")
    # 6) short
    api("POST",f"/api/activities/{A}/control",{"action":"next"}); api("POST",f"/api/activities/{A}/control",{"action":"open"})
    ph.wait_for_selector("textarea",timeout=8000); ph.fill("textarea","نقطة التجمع"); shot("17_short")
    ph.click("text=إرسال الإجابة"); ph.wait_for_selector("text=تم استلام إجابتك")
    # 7) scenario with 3s timer -> time up without answering
    api("POST",f"/api/activities/{A}/control",{"action":"next"}); api("POST",f"/api/activities/{A}/control",{"action":"open"})
    ph.wait_for_selector("text=أثناء محاضرة",timeout=8000); shot("18_scenario_timer")
    ph.wait_for_selector("text=لم ترسل إجابة لهذا السؤال",timeout=9000); shot("19_time_up_missed")
    # 8) offline banner
    ph_ctx.set_offline(True); ph.evaluate("window.dispatchEvent(new Event('offline'))"); ph.wait_for_selector("text=لا يوجد اتصال بالإنترنت",timeout=5000); shot("20_offline")
    ph_ctx.set_offline(False); ph.evaluate("window.dispatchEvent(new Event('online'))")
    ph.wait_for_timeout(2500)
    # 9) end
    api("POST",f"/api/activities/{A}/control",{"action":"end"}); ph.wait_for_selector("text=انتهى النشاط",timeout=8000); shot("21_ended")
    # 10) direct navigation to admin pages from the phone
    for path in ["/dashboard",f"/activities/{A}/live",f"/present/{A}","/reports"]:
        ph.goto(BASE+path); assert re.search(r"/login$", ph.url), (path, ph.url)
    shot("22_admin_redirect_login")
    # English
    ph_ctx.add_cookies([{"name":"safe_lang","value":"en","url":BASE}])
    ph.goto(f"{BASE}/join?code={code}"); ph.wait_for_timeout(600); shot("23_join_en_prefilled")
    b.close()
print("\n".join(errors) or "no console errors")
