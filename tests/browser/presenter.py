import json, re
from playwright.sync_api import sync_playwright
BASE="http://localhost:3300"; S="/home/claude/qa/pshots"
errors=[]
def watch(pg,tag):
    pg.on("console", lambda m: m.type=="error" and errors.append(f"[{tag}] {m.text}"))
    pg.on("pageerror", lambda e: errors.append(f"[{tag}] {e}"))
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    tr=b.new_context(viewport={"width":1920,"height":1080}, bypass_csp=True)
    rq=tr.request
    H={"Content-Type":"application/json","Origin":BASE}
    def api(m,path,body=None,req=rq):
        r=req.fetch(BASE+path,method=m,data=json.dumps(body) if body is not None else None,headers=H)
        assert r.ok,(path,r.status,r.text()); return r.json()
    api("POST","/api/auth/setup",{"name":"م. خالد العتيبي","email":"k@safe.test","password":"Trainer#2026"})
    c=api("POST","/api/courses",{"title":"إدارة الحشود والإخلاء الآمن","mode":"onsite","trainer_name":"م. خالد العتيبي"})["id"]
    A=api("POST","/api/activities",{"course_id":c,"title":"تقييم الوحدة الأولى"})["id"]
    api("PATCH",f"/api/activities/{A}",{"show_leaderboard":True})
    qs=[
     {"type":"mcq","title":"ما أول إجراء عند ملاحظة تكدّس خطير عند بوابة الدخول؟","options":[{"id":"a","text":"إيقاف تدفق الدخول وفتح مسارات بديلة"},{"id":"b","text":"مطالبة الحضور بالإسراع"},{"id":"c","text":"إغلاق جميع البوابات فوراً"},{"id":"d","text":"انتظار تعليمات الإدارة"}],"correct":["a"],"explanation":"إيقاف التدفق يمنع تفاقم التكدس، وفتح المسارات البديلة يوزّع الضغط.","points":2,"time_limit":30},
     {"type":"order","title":"رتّب خطوات الإخلاء","options":[{"id":"s1","text":"إطلاق الإنذار"},{"id":"s2","text":"توجيه الحضور إلى المخارج"},{"id":"s3","text":"التحقق من خلو المبنى"},{"id":"s4","text":"العدّ في نقطة التجمع"}],"points":2,"time_limit":60},
     {"type":"short","title":"ما اسم المكان الذي يتجمع فيه الحضور بعد الإخلاء؟","correct":["نقطة التجمع"],"points":1,"time_limit":0},
    ]
    qids=[api("POST","/api/questions",{"activity_id":A,"difficulty":"easy",**q})["id"] for q in qs]
    pg=tr.new_page(); watch(pg,"presenter")
    pg.goto(f"{BASE}/present/{A}"); pg.wait_for_timeout(700)
    pg.screenshot(path=f"{S}/01_not_started.png")
    pg.click("text=بدء النشاط"); pg.wait_for_selector("text=جاهز للبدء")
    code=api("GET",f"/api/activities/{A}/live")["activity"]["join_code"]
    names=["سارة القحطاني","عبدالله الشهري","ريم الدوسري","ماجد الحربي","نورة السبيعي","فهد العنزي","هند المطيري","تركي الغامدي"]
    trainees=[]
    for i,n in enumerate(names):
        ctx=b.new_context(); api("POST",f"/api/play/{code}/join",{"name":n,"trainee_number":str(3000+i)},req=ctx.request); trainees.append(ctx)
    phone_ctx=trainees[0]
    phone=phone_ctx.new_page(); phone.set_viewport_size({"width":390,"height":844}); watch(phone,"phone")
    phone.goto(f"{BASE}/play/{code}")
    pg.wait_for_timeout(800)
    pg.screenshot(path=f"{S}/02_ready.png")
    # start question via on-screen button
    pg.mouse.move(900,900); pg.click("text=بدء السؤال"); pg.wait_for_selector("text=إغلاق الإجابات")
    picks=["a","b","a","a","c","a","b"]
    for ctx,ch in zip(trainees[:7],picks):
        api("POST",f"/api/play/{code}/answer",{"question_id":qids[0],"answer":{"choice":ch}},req=ctx.request)
    pg.wait_for_function("document.body.innerText.includes('7/8')", timeout=5000)  # live, no reload
    pg.mouse.move(900,950); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{S}/03_open_live_counts.png")
    pg.click("text=توزيع الإجابات"); pg.wait_for_selector("text=57.1%")
    pg.screenshot(path=f"{S}/04_distribution_before_reveal.png")
    # trainee phone must not show correct answer while distribution is on the screen
    phone.wait_for_timeout(500)
    st=api("GET",f"/api/play/{code}",req=phone_ctx.request)
    assert st["reveal"] is None
    phone.screenshot(path=f"{S}/05_phone_during_distribution.png")
    pg.click("text=إغلاق الإجابات"); pg.wait_for_selector("text=أُغلق استقبال الإجابات")
    pg.click("text=إظهار الإجابة الصحيحة"); pg.wait_for_selector("text=شرح الإجابة الصحيحة")
    pg.wait_for_timeout(900)
    pg.screenshot(path=f"{S}/06_revealed.png")
    phone.wait_for_selector("text=إجابتك صحيحة", timeout=6000)
    phone.screenshot(path=f"{S}/07_phone_after_reveal.png")
    pg.click("text=الترتيب"); pg.wait_for_timeout(600); pg.screenshot(path=f"{S}/08_leaderboard.png"); pg.keyboard.press("Escape")
    # next → order question
    pg.click("text=السؤال التالي"); pg.wait_for_selector("text=رتّب خطوات الإخلاء")
    pg.keyboard.press("Space"); pg.wait_for_selector("text=إغلاق الإجابات")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{S}/09_order_open.png")
    for i,ctx in enumerate(trainees[:6]):
        order=["s1","s2","s3","s4"] if i%2==0 else ["s2","s1","s3","s4"]
        api("POST",f"/api/play/{code}/answer",{"question_id":qids[1],"answer":{"order":order}},req=ctx.request)
    pg.keyboard.press("r"); pg.wait_for_selector("text=نسبة الإجابات الصحيحة")
    pg.wait_for_timeout(800); pg.screenshot(path=f"{S}/10_order_revealed.png")
    pg.keyboard.press("ArrowLeft"); pg.wait_for_selector("text=بعد الإخلاء؟")
    pg.keyboard.press("Space"); pg.wait_for_selector("text=يكتب المتدربون")
    for ctx,t in zip(trainees[:5],["نقطة التجمع","نقطه التجمع","المخرج","نقطة التجمّع","الساحة"]):
        api("POST",f"/api/play/{code}/answer",{"question_id":qids[2],"answer":{"text":t}},req=ctx.request)
    pg.wait_for_timeout(500); pg.screenshot(path=f"{S}/11_short_open.png")
    pg.click("text=إظهار الإجابة الصحيحة"); pg.wait_for_timeout(900)
    pg.screenshot(path=f"{S}/12_short_revealed.png")
    pg.click("text=إنهاء النشاط >> nth=-1") if False else None
    pg.once("dialog", lambda dlg: dlg.accept())
    pg.locator("button:has-text('إنهاء النشاط')").click(); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{S}/13_ended.png")
    # 720p projector check
    small=b.new_context(viewport={"width":1280,"height":720}, storage_state=tr.storage_state())
    sp=small.new_page(); watch(sp,"720p")
    api("POST",f"/api/activities/{A}/control",{"action":"restart"})
    api("POST",f"/api/activities/{A}/control",{"action":"open"})
    sp.goto(f"{BASE}/present/{A}"); sp.wait_for_timeout(1200); sp.mouse.move(600,600); sp.wait_for_timeout(300)
    sp.screenshot(path=f"{S}/14_720p_open.png")
    b.close()
print("\n".join(errors) or "no console errors")
