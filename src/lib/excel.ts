import "server-only";
import ExcelJS from "exceljs";
import type { Dict, Lang } from "./i18n";
import type { ActivityReport, CourseReport } from "./reports";

const GOLD = "FFBC9A5F";
const NAVY = "FF1B1F2A";
const SAND = "FFF2EBDF";
const FONT = "Sakkal Majalla";

function sheet(wb: ExcelJS.Workbook, name: string, lang: Lang) {
  return wb.addWorksheet(name.slice(0, 31), { views: [{ rightToLeft: lang === "ar", state: "frozen", ySplit: 1 }] });
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.height = 24;
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "medium", color: { argb: GOLD } } };
  });
  ws.eachRow((r, i) => {
    if (i === 1) return;
    r.eachCell((c) => {
      c.font = { name: FONT, size: 12 };
      c.alignment = { vertical: "middle", wrapText: true };
      if (i % 2 === 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SAND } };
    });
  });
}

function kv(ws: ExcelJS.Worksheet, rows: [string, string | number][]) {
  ws.columns = [{ width: 32 }, { width: 50 }];
  rows.forEach(([k, v], i) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { name: FONT, bold: true, size: 12, color: { argb: i === 0 ? GOLD : NAVY } };
    r.getCell(2).font = { name: FONT, size: 12, bold: i === 0 };
  });
}

export async function activityWorkbook(rep: ActivityReport, d: Dict, lang: Lang): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SAFE Training Platform";
  const s = rep.summary!;
  const sum = wb.addWorksheet(d.summary.slice(0, 31), { views: [{ rightToLeft: lang === "ar" }] });
  kv(sum, [
    [d.activity_report, rep.activity.title],
    [d.nav_courses, rep.activity.course_title],
    [d.run, `${d.run_n}${rep.run!.number}`],
    [d.date, new Date(rep.run!.started_at).toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB")],
    [d.participants, s.participants],
    [d.questions_asked, s.questions_asked],
    [d.avg_result, `${s.average_percent}%`],
    [d.participation_rate, `${s.participation_rate}%`],
    [d.pending_reviews, s.pending_reviews],
  ]);

  const ranked = !!rep.activity.show_leaderboard;
  const ps = sheet(wb, d.participants, lang);
  ps.columns = [
    ...(ranked ? [{ header: d.rank, key: "rank", width: 9 }] : []),
    { header: d.participant_name, key: "name", width: 30 },
    { header: d.trainee_number, key: "num", width: 16 },
    { header: d.correct_count, key: "correct", width: 11 },
    { header: d.wrong_count, key: "wrong", width: 11 },
    { header: d.unanswered, key: "un", width: 12 },
    { header: d.pending, key: "pending", width: 14 },
    { header: d.score, key: "score", width: 12 },
    { header: d.percent, key: "pct", width: 11 },
  ];
  for (const p of rep.participants)
    ps.addRow({ rank: p.rank, name: p.name, num: p.trainee_number ?? "", correct: p.correct, wrong: p.wrong, un: p.unanswered, pending: p.pending, score: `${p.score} / ${p.max_score}`, pct: p.percent / 100 });
  ps.getColumn("pct").numFmt = "0.0%";
  styleHeader(ps);

  const qs = sheet(wb, d.questions, lang);
  qs.columns = [
    { header: "#", key: "pos", width: 6 },
    { header: d.q_title, key: "title", width: 50 },
    { header: d.q_type, key: "type", width: 20 },
    { header: d.correct_answer, key: "ans", width: 40 },
    { header: d.answered, key: "answered", width: 11 },
    { header: d.correct_count, key: "correct", width: 11 },
    { header: d.wrong_count, key: "wrong", width: 11 },
    { header: d.wrong_rate, key: "wr", width: 12 },
    { header: d.participation_rate, key: "part", width: 14 },
  ];
  for (const q of [...rep.questionStats].sort((a, b) => b.wrong_rate - a.wrong_rate))
    qs.addRow({ pos: q.position, title: q.title, type: d[`t_${q.type}` as keyof Dict], ans: q.correct_text, answered: q.answered, correct: q.correct, wrong: q.wrong, wr: q.wrong_rate / 100, part: q.participation / 100 });
  qs.getColumn("wr").numFmt = "0.0%";
  qs.getColumn("part").numFmt = "0.0%";
  styleHeader(qs);

  const ms = sheet(wb, d.answers_detail, lang);
  ms.columns = [
    { header: d.participant_name, key: "name", width: 28 },
    { header: d.trainee_number, key: "num", width: 14 },
    ...rep.questions.map((q, i) => ({ header: `${i + 1}. ${(q.title || q.body).slice(0, 40)}`, key: `q${q.id}`, width: 28 })),
  ];
  for (const m of rep.matrix) {
    const row: Record<string, string> = { name: m.participant.name, num: m.participant.trainee_number ?? "" };
    m.cells.forEach((c, i) => {
      row[`q${rep.questions[i].id}`] = c ? `${c.is_correct === 1 ? "✔" : c.is_correct === 0 ? "✘" : "?"} ${c.text}` : "—";
    });
    ms.addRow(row);
  }
  styleHeader(ms);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function courseWorkbook(rep: CourseReport, d: Dict, lang: Lang): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet(d.summary.slice(0, 31), { views: [{ rightToLeft: lang === "ar" }] });
  kv(sum, [
    [d.course_report, rep.course.title],
    [d.trainer_name, rep.course.trainer_name],
    [d.course_date, rep.course.course_date ?? ""],
    [d.training_mode, rep.course.mode === "remote" ? d.mode_remote : d.mode_onsite],
    [d.activities_run, rep.summary.activities_run],
    [d.unique_trainees, rep.summary.unique_trainees],
    [d.avg_result, `${rep.summary.average_percent}%`],
    [d.participation_rate, `${rep.summary.participation_rate}%`],
  ]);
  const as = sheet(wb, d.stat_activities, lang);
  as.columns = [
    { header: d.activity_name, key: "t", width: 36 },
    { header: d.run, key: "r", width: 10 },
    { header: d.participants, key: "p", width: 12 },
    { header: d.avg_result, key: "avg", width: 16 },
    { header: d.participation_rate, key: "part", width: 16 },
    { header: d.hardest_q, key: "h", width: 44 },
  ];
  for (const a of rep.activities)
    as.addRow({ t: a.title, r: a.run ? a.run.number : "—", p: a.summary?.participants ?? 0, avg: (a.summary?.average_percent ?? 0) / 100, part: (a.summary?.participation_rate ?? 0) / 100, h: a.hardest ? `${a.hardest.title} (${a.hardest.wrong_rate}%)` : "" });
  as.getColumn("avg").numFmt = "0.0%";
  as.getColumn("part").numFmt = "0.0%";
  styleHeader(as);
  const ts = sheet(wb, d.unique_trainees, lang);
  ts.columns = [
    { header: d.participant_name, key: "n", width: 30 },
    { header: d.trainee_number, key: "num", width: 16 },
    { header: d.stat_activities, key: "a", width: 10 },
    { header: d.correct_count, key: "c", width: 10 },
    { header: d.wrong_count, key: "w", width: 10 },
    { header: d.score, key: "s", width: 14 },
    { header: d.percent, key: "pct", width: 10 },
  ];
  for (const t of rep.trainees) ts.addRow({ n: t.name, num: t.trainee_number ?? "", a: t.activities, c: t.correct, w: t.wrong, s: `${t.score} / ${t.max}`, pct: t.percent / 100 });
  ts.getColumn("pct").numFmt = "0.0%";
  styleHeader(ts);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
