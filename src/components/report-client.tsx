"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Check, Printer, X } from "lucide-react";
import { api } from "./api";
import { useI18n } from "./i18n";

export function GradeCell({ answerId, text, isCorrect, interactive }: { answerId: number; text: string; isCorrect: number | null; interactive: boolean }) {
  const router = useRouter();
  const { d } = useI18n();
  const tone = isCorrect === 1 ? "text-forest" : isCorrect === 0 ? "text-bronze" : "text-gold";
  const mark = isCorrect === 1 ? "✔" : isCorrect === 0 ? "✘" : "?";
  return (
    <div className="group">
      <span className={`font-bold ${tone}`}>{mark}</span> <span className="text-navy/85">{text}</span>
      {interactive && (
        <span className="no-print ms-1 inline-flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button title={d.mark_right} className="p-0.5 text-platinum hover:text-forest" onClick={async () => { await api(`/api/answers/${answerId}`, "PATCH", { correct: true }); router.refresh(); }}><Check size={14} /></button>
          <button title={d.mark_wrong} className="p-0.5 text-platinum hover:text-bronze" onClick={async () => { await api(`/api/answers/${answerId}`, "PATCH", { correct: false }); router.refresh(); }}><X size={14} /></button>
        </span>
      )}
    </div>
  );
}

export function RunSelect({ activityId, runs, current }: { activityId: number; runs: { id: number; number: number; participants: number }[]; current: number }) {
  const router = useRouter();
  const { d } = useI18n();
  return (
    <select className="field !w-auto" value={current} onChange={(e) => router.push(`/reports/activity/${activityId}?run=${e.target.value}`)}>
      {runs.map((r) => <option key={r.id} value={r.id}>{d.run_n}{r.number} · {r.participants} {d.participants}</option>)}
    </select>
  );
}

export function AutoPrint() {
  const { d } = useI18n();
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="no-print fixed top-4 end-4 flex gap-2">
      <button className="btn btn-primary" onClick={() => window.print()}><Printer size={17} /> {d.export_pdf}</button>
      <button className="btn btn-outline" onClick={() => window.close()}>{d.close}</button>
    </div>
  );
}
