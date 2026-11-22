import json, re
from playwright.sync_api import sync_playwright
BASE="http://localhost:3600"; S="/home/claude/qa/lshots"; errors=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":1440,"height":960}); rq=ctx.request; H={"Content-Type":"application/json","Origin":BASE}
    def api(m,path,body=None):
        r=rq.fetch(BASE+path,method=m,data=json.dumps(body) if body is not None else None,headers=H); assert r.ok,(path,r.status,r.text()); return r.json()
    api("POST","/api/auth/setup",{"name":"م. خالد العتيبي","email":"k@safe.test","password":"Trainer#2026"})
    O=lambda *t:[{"id":chr(97+i),"text":x} for i,x in enumerate(t)]
    bank=[
     dict(type="mcq",title="ما أول إجراء عند ملاحظة تكدّس خطير عند بوابة الدخول؟",options=O("إيقاف تدفق الدخول وفتح مسارات بديلة","مطالبة الحضور بالإسراع","إغلاق جميع البوابات"),correct=["a"],domain="الأمن والسلامة",specialty="إدارة الحشود",topic="البوابات",difficulty="medium",tags=["حشود","طوارئ"]),
     dict(type="tf",title="يجوز قفل مخارج الطوارئ أثناء الفعالية لمنع التسلل.",correct=["false"],domain="الأمن والسلامة",specialty="إدارة الحشود",topic="المخارج",tags=["حشود","مخارج"]),
     dict(type="order",title="رتّب خطوات الإخلاء",options=[{"id":"s1","text":"إطلاق الإنذار"},{"id":"s2","text":"التوجيه للمخارج"},{"id":"s3","text":"العد في نقطة التجمع"}],domain="الأمن والسلامة",specialty="الحماية من الحريق",topic="الإخلاء",difficulty="advanced",tags=["إخلاء","طوارئ"]),
     dict(type="mcq",title="ما نوع طفاية الحريق المناسبة لحرائق الكهرباء؟",options=O("ثاني أكسيد الكربون","الماء","الرغوة"),correct=["a"],domain="الأمن والسلامة",specialty="الحماية من الحريق",topic="الطفايات",tags=["حريق"]),
     dict(type="short",title="ما اسم هجوم انتحال رسائل البريد لسرقة البيانات؟",correct=["التصيد","التصيد الاحتيالي"],domain="الأمن السيبراني",specialty="التوعية",topic="الهندسة الاجتماعية",tags=["بريد","توعية"]),
     dict(type="multi",title="ما علامات الرسالة الاحتيالية؟",options=O("رابط مختصر مجهول","طلب عاجل لكلمة المرور","توقيع رسمي معروف"),correct=["a","b"],domain="الأمن السيبراني",specialty="التوعية",topic="الهندسة الاجتماعية",difficulty="medium",tags=["بريد"]),
     dict(type="scenario",title="سيناريو: شخص يتبعك عبر باب مؤمّن",body="أثناء دخولك المبنى بالبطاقة، حاول شخص لا تعرفه الدخول خلفك مباشرة. ماذا تفعل؟",options=O("أطلب منه استخدام بطاقته بلطف","أتركه يدخل","أتجاهله"),correct=["a"],domain="الأمن السيبراني",specialty="الأمن المادي",topic="الدخول",difficulty="advanced",tags=["دخول","توعية"]),
     dict(type="tf",title="يمكن مشاركة كلمة المرور مع الزملاء الموثوقين.",correct=["false"],domain="الأمن السيبراني",specialty="التوعية",topic="كلمات المرور",tags=["توعية"]),
    ]
    ids=[api("POST","/api/bank",q)["id"] for q in bank]
    c1=api("POST","/api/courses",{"title":"إدارة الحشود والإخلاء الآمن"})["id"]; c2=api("POST","/api/courses",{"title":"التوعية بالأمن السيبراني","mode":"remote"})["id"]
    a_exist=api("POST","/api/activities",{"course_id":c1,"title":"تقييم الوحدة الأولى"})["id"]
    pg=ctx.new_page(); pg.on("pageerror",lambda e: errors.append(str(e))); pg.on("console",lambda m: m.type=="error" and errors.append(m.text))
    pg.goto(BASE+"/library"); pg.wait_for_selector("text=ما نوع طفاية"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{S}/01_library.png",full_page=True)
    pg.fill("input[type=search]","الاخلاء"); pg.wait_for_timeout(700); pg.screenshot(path=f"{S}/02_search.png")
    pg.fill("input[type=search]",""); pg.locator("aside button", has_text="توعية").first.click(); pg.wait_for_timeout(600)
    pg.locator("aside select").first.select_option("الأمن السيبراني"); pg.wait_for_timeout(600)
    pg.screenshot(path=f"{S}/03_filtered.png")
    assert "tag=" in pg.url and "domain=" in pg.url
    # select all → import to a NEW activity in course 2
    pg.click("text=تحديد الكل"); pg.wait_for_selector("text=محدد"); pg.screenshot(path=f"{S}/04_selected.png")
    pg.click(".fixed >> text=استيراد إلى نشاط"); pg.wait_for_selector("[role=dialog]")
    pg.click("[role=dialog] >> text=نشاط جديد"); pg.select_option("#imp-course", str(c2)); pg.fill("#imp-title","اختبار التوعية الشامل")
    pg.screenshot(path=f"{S}/05_import_dialog.png")
    pg.click("[role=dialog] form >> button.btn-primary"); pg.wait_for_selector("text=تم استيراد الأسئلة"); pg.screenshot(path=f"{S}/06_import_done.png")
    pg.click("text=فتح النشاط"); pg.wait_for_url(re.compile(r"/activities/\d+$")); pg.wait_for_selector("text=من المكتبة")
    new_act=int(pg.url.rsplit("/",1)[1]); pg.wait_for_timeout(400)
    pg.screenshot(path=f"{S}/07_activity_linked.png",full_page=True)
    # edit bank question in the UI → new version
    pg.goto(f"{BASE}/library/{ids[7]}"); pg.wait_for_selector("text=أين يُستخدم")
    pg.fill("#q-title","لا يجوز مشاركة كلمة المرور حتى مع الزملاء الموثوقين.")
    pg.get_by_role("button", name="حفظ", exact=True).click(); pg.wait_for_selector("h3:has-text('v2')",timeout=8000); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{S}/08_bank_editor_v2.png",full_page=True)
    pg.goto(f"{BASE}/activities/{new_act}"); pg.wait_for_selector("text=تحديث متاح"); pg.screenshot(path=f"{S}/09_update_available.png",full_page=True)
    pg.click("text=تحديث متاح"); pg.wait_for_selector("text=لا يجوز مشاركة كلمة المرور"); 
    # picker in existing activity
    pg.goto(f"{BASE}/activities/{a_exist}"); pg.click("text=استيراد من المكتبة"); pg.wait_for_selector("[role=dialog] >> text=رتّب خطوات الإخلاء")
    pg.fill("[role=dialog] input[type=search]","حشود"); pg.wait_for_timeout(600)
    for b_ in pg.locator("[role=dialog] [aria-pressed]").all(): b_.click()
    pg.screenshot(path=f"{S}/10_picker.png")
    pg.click("text=إضافة المحدد"); pg.wait_for_selector("text=يجوز قفل مخارج"); pg.wait_for_timeout(400)
    # write a question inside the activity, then save it to the library
    api("POST","/api/questions",{"activity_id":a_exist,"type":"tf","title":"يجب تحديد نقطة تجمع قبل الفعالية.","correct":["true"]})
    pg.reload(); pg.click("button[title='حفظ في المكتبة']"); pg.wait_for_selector("[role=dialog] >> text=التصنيف")
    pg.fill("[role=dialog] input[list$='-domain-l']","الأمن والسلامة"); pg.screenshot(path=f"{S}/11_save_to_library.png")
    pg.locator("[role=dialog]").get_by_role("button", name="حفظ", exact=True).click(); pg.wait_for_timeout(800)
    # archive
    pg.goto(BASE+"/library"); pg.wait_for_selector("text=رتّب خطوات الإخلاء")
    pg.locator("li", has_text="رتّب خطوات الإخلاء").locator("button[title='أرشفة']").click(); pg.wait_for_timeout(700)
    pg.click("text=الأرشيف"); pg.wait_for_selector("text=رتّب خطوات الإخلاء"); pg.screenshot(path=f"{S}/12_archive.png")
    # mobile library
    m=b.new_context(viewport={"width":390,"height":844},device_scale_factor=2,storage_state=ctx.storage_state()); mp=m.new_page()
    mp.goto(BASE+"/library"); mp.wait_for_timeout(900); mp.screenshot(path=f"{S}/13_mobile.png")
    b.close()
print("\n".join(errors) or "no console errors")
