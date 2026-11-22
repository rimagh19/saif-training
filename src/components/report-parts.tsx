import type { Dict } from "@/lib/i18n";
import type { ActivityReport, CourseReport } from "@/lib/reports";
import { Bar, fmtDate, fmtDateTime, StatCard } from "./ui";
import { GradeCell } from "./report-client";

export const typeName = (d: Dict, t: string) => d[`t_${t}` as keyof Dict] ?? t;

export function ActivityReportBody({ rep, d, lang, print = false }: { rep: ActivityReport; d: Dict; lang: string; print?: boolean }) {
  const s = rep.summary!;
  const ranked = !!rep.activity.show_leaderboard;
  const mostWrong = [...rep.questionStats].filter((q) => q.answered > 0).sort((a, b) => b.wrong_rate - a.wrong_rate);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={d.participants} value={s.participants} />
        <StatCard label={d.avg_result} value={`${s.average_percent}%`} hint={<span dir="ltr">{s.average_score} / {s.max_score}</span>} />
        <StatCard label={d.participation_rate} value={`${s.participation_rate}%`} />
        <StatCard label={d.questions_asked} value={s.questions_asked} hint={s.pending_reviews ? `${s.pending_reviews} ${d.pending}` : undefined} />
      </div>

      <section className="card p-5 break-inside-avoid">
        <h2 className="text-xl mb-3">{d.participants}{ranked ? "" : ""}</h2>
        {!ranked && <p className="text-xs text-platinum mb-2">{d.ranking_off}</p>}
        {rep.participants.length === 0 ? (
          <p className="text-platinum">{d.none_yet}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  {ranked && <th>{d.rank}</th>}
                  <th>{d.participant_name}</th>
                  <th>{d.trainee_number}</th>
                  <th>{d.correct_count}</th>
                  <th>{d.wrong_count}</th>
                  <th>{d.unanswered}</th>
                  <th>{d.score}</th>
                  <th className="w-44">{d.percent}</th>
                </tr>
              </thead>
              <tbody>
                {rep.participants.map((p) => (
                  <tr key={p.id}>
                    {ranked && <td><span className={`inline-grid place-items-center w-7 h-7 rounded-full text-sm num ${p.rank <= 3 ? "bg-gold text-white" : "bg-sand"}`}>{p.rank}</span></td>}
                    <td className="font-bold">{p.name}</td>
                    <td className="num">{p.trainee_number ?? "—"}</td>
                    <td className="num text-forest font-bold">{p.correct}</td>
                    <td className="num text-bronze font-bold">{p.wrong}</td>
                    <td className="num">{p.unanswered}{p.pending ? <span className="text-xs text-platinum"> (+{p.pending} {d.pending})</span> : null}</td>
                    <td className="num whitespace-nowrap"><span dir="ltr">{p.score} / {p.max_score}</span></td>
                    <td><div className="flex items-center gap-2"><span className="num font-bold w-12">{p.percent}%</span><Bar value={p.percent} tone={p.percent >= 50 ? "forest" : "bronze"} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5 break-inside-avoid">
        <h2 className="text-xl mb-3">{d.most_wrong}</h2>
        {mostWrong.length === 0 ? (
          <p className="text-platinum">{d.none_yet}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>#</th><th>{d.q_title}</th><th>{d.q_type}</th><th>{d.correct_answer}</th><th>{d.answered}</th><th>{d.correct_count}</th><th>{d.wrong_count}</th><th className="w-40">{d.wrong_rate}</th></tr></thead>
              <tbody>
                {mostWrong.map((q) => (
                  <tr key={q.id}>
                    <td className="num">{q.position}</td>
                    <td className="font-bold max-w-72">{q.title}</td>
                    <td className="text-sm whitespace-nowrap">{typeName(d, q.type)}</td>
                    <td className="text-sm text-forest max-w-56">{q.correct_text}</td>
                    <td className="num">{q.answered}</td>
                    <td className="num">{q.correct}</td>
                    <td className="num">{q.wrong}</td>
                    <td><div className="flex items-center gap-2"><span className="num font-bold w-12">{q.wrong_rate}%</span><Bar value={q.wrong_rate} tone="bronze" /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {rep.questions.length > 0 && rep.matrix.length > 0 && (
        <section className={`card p-5 ${print ? "break-before-page" : ""}`}>
          <h2 className="text-xl mb-3">{d.answers_detail}</h2>
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>{d.participant_name}</th>
                  {rep.questions.map((q, i) => <th key={q.id} title={q.title || q.body} className="num">{rep.questionStats[i]?.position ?? i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {rep.matrix.map((m) => (
                  <tr key={m.participant.id}>
                    <td className="font-bold whitespace-nowrap">{m.participant.name}</td>
                    {m.cells.map((c, i) => (
                      <td key={i} className="min-w-28 align-top">
                        {c ? <GradeCell answerId={c.answer_id} text={c.text} isCorrect={c.is_correct} interactive={!print} /> : <span className="text-silver">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {print && <p className="text-xs text-platinum">{d.generated_at}: {fmtDateTime(rep.generated_at, lang)}</p>}
    </div>
  );
}

export function CourseReportBody({ rep, d, lang }: { rep: CourseReport; d: Dict; lang: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={d.activities_run} value={rep.summary.activities_run} />
        <StatCard label={d.unique_trainees} value={rep.summary.unique_trainees} />
        <StatCard label={d.avg_result} value={`${rep.summary.average_percent}%`} />
        <StatCard label={d.participation_rate} value={`${rep.summary.participation_rate}%`} />
      </div>
      <section className="card p-5 break-inside-avoid">
        <h2 className="text-xl mb-3">{d.course_activities}</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>{d.activity_name}</th><th>{d.run}</th><th>{d.date}</th><th>{d.participants}</th><th className="w-44">{d.avg_result}</th><th>{d.participation_rate}</th><th>{d.hardest_q}</th></tr></thead>
            <tbody>
              {rep.activities.map((a) => (
                <tr key={a.id}>
                  <td className="font-bold">{a.title}</td>
                  <td className="num">{a.run ? `${d.run_n}${a.run.number}` : "—"}</td>
                  <td className="text-sm">{a.run ? fmtDate(a.run.started_at, lang) : "—"}</td>
                  <td className="num">{a.summary?.participants ?? 0}</td>
                  <td>{a.summary ? <div className="flex items-center gap-2"><span className="num font-bold w-12">{a.summary.average_percent}%</span><Bar value={a.summary.average_percent} /></div> : "—"}</td>
                  <td className="num">{a.summary ? `${a.summary.participation_rate}%` : "—"}</td>
                  <td className="text-sm max-w-64">{a.hardest && a.hardest.wrong > 0 ? `${a.hardest.title} (${a.hardest.wrong_rate}%)` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card p-5 break-inside-avoid">
        <h2 className="text-xl mb-3">{d.unique_trainees}</h2>
        {rep.trainees.length === 0 ? <p className="text-platinum">{d.none_yet}</p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{d.participant_name}</th><th>{d.trainee_number}</th><th>{d.stat_activities}</th><th>{d.correct_count}</th><th>{d.wrong_count}</th><th>{d.score}</th><th className="w-44">{d.percent}</th></tr></thead>
              <tbody>
                {rep.trainees.map((t, i) => (
                  <tr key={i}>
                    <td className="font-bold">{t.name}</td>
                    <td className="num">{t.trainee_number ?? "—"}</td>
                    <td className="num">{t.activities}</td>
                    <td className="num text-forest font-bold">{t.correct}</td>
                    <td className="num text-bronze font-bold">{t.wrong}</td>
                    <td className="num"><span dir="ltr">{t.score} / {t.max}</span></td>
                    <td><div className="flex items-center gap-2"><span className="num font-bold w-12">{t.percent}%</span><Bar value={t.percent} tone={t.percent >= 50 ? "forest" : "bronze"} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
