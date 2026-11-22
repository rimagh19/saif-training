"use client";
import { useEffect, useState } from "react";
import { Check, Layers, Search, Tag } from "lucide-react";
import { Modal } from "./modal";
import { api, ApiError } from "./api";
import { useI18n } from "./i18n";
import { typeLabel } from "./question-editor";
import { BankFields, type BankMetaDraft, type Suggestions } from "./bank-fields";
import type { BankQuestion } from "@/lib/bank";

/** Pick questions from the central bank and add them (as linked copies) to an activity. */
export function BankPicker({ activityId, suggestions, onClose, onDone }: { activityId: number; suggestions: Suggestions; onClose: () => void; onDone: () => void }) {
  const { d, err } = useI18n();
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limit: "60" });
      if (q) p.set("q", q);
      if (domain) p.set("domain", domain);
      if (difficulty) p.set("difficulty", difficulty);
      api<{ items: BankQuestion[]; total: number }>(`/api/bank?${p}`).then((r) => {
        if (!alive) return;
        setItems(r.items);
        setTotal(r.total);
      });
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, domain, difficulty]);

  return (
    <Modal title={d.import_from_library} onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={17} className="absolute top-1/2 -translate-y-1/2 start-3 text-platinum" />
          <input autoFocus type="search" className="field !ps-9" placeholder={d.lib_search_ph} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field !w-auto" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label={d.domain}>
          <option value="">{d.domain}: {d.all}</option>
          {suggestions.domains.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className="field !w-auto" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label={d.difficulty}>
          <option value="">{d.difficulty}: {d.all}</option>
          <option value="easy">{d.d_easy}</option>
          <option value="medium">{d.d_medium}</option>
          <option value="advanced">{d.d_advanced}</option>
        </select>
      </div>
      <p className="text-xs text-platinum mb-2 num">{total} {d.results_n}</p>
      {items.length === 0 ? (
        <p className="text-center text-platinum py-10">{total === 0 && !q && !domain && !difficulty ? d.lib_empty : d.lib_no_results}</p>
      ) : (
        <ul className="space-y-2 max-h-[50dvh] overflow-y-auto pe-1">
          {items.map((it) => {
            const on = sel.includes(it.id);
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setSel((s) => (on ? s.filter((x) => x !== it.id) : [...s, it.id]))}
                  className={`w-full text-start flex gap-3 rounded-xl border-2 p-3 transition-colors ${on ? "border-gold bg-gold/5" : "border-silver/60 hover:border-gold/60"}`}
                  aria-pressed={on}
                >
                  <span className={`shrink-0 w-6 h-6 rounded-md border-2 grid place-items-center ${on ? "bg-gold border-gold text-white" : "border-silver"}`}>{on && <Check size={14} strokeWidth={3} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-snug">{it.title || it.body.slice(0, 140)}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5 text-xs text-platinum">
                      <span className="badge bg-gold/15 text-bronze">{typeLabel(d, it.type)}</span>
                      <span className="badge bg-sand">{d[`d_${it.difficulty}` as const]}</span>
                      {[it.domain, it.specialty, it.topic].some(Boolean) && <span className="flex items-center gap-1"><Layers size={12} />{[it.domain, it.specialty, it.topic].filter(Boolean).join(" › ")}</span>}
                      {it.tags.map((t) => <span key={t} className="text-bronze flex items-center gap-0.5"><Tag size={11} />{t}</span>)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="text-bronze font-bold mt-3">{error}</p>}
      <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-silver/50">
        <button className="btn btn-outline" onClick={onClose}>{d.cancel}</button>
        <button
          className="btn btn-primary"
          disabled={busy || sel.length === 0}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/api/bank/import", "POST", { ids: sel, activity_id: activityId });
              onDone();
            } catch (x) {
              setError(err(x instanceof ApiError ? x.code : undefined));
              setBusy(false);
            }
          }}
        >
          {d.add_selected} {sel.length > 0 && <span className="num">({sel.length})</span>}
        </button>
      </div>
    </Modal>
  );
}

/** Save one activity question into the bank, with its classification. */
export function SaveToBankDialog({ questionId, defaults, suggestions, onClose, onDone }: { questionId: number; defaults: BankMetaDraft; suggestions: Suggestions; onClose: () => void; onDone: () => void }) {
  const { d, err } = useI18n();
  const [meta, setMeta] = useState(defaults);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={d.save_to_library} onClose={onClose}>
      <BankFields value={meta} onChange={setMeta} suggestions={suggestions} />
      {error && <p role="alert" className="text-bronze font-bold mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn btn-outline" onClick={onClose}>{d.cancel}</button>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/questions/${questionId}/bank`, "POST", meta);
              onDone();
            } catch (x) {
              setError(err(x instanceof ApiError ? x.code : undefined));
              setBusy(false);
            }
          }}
        >
          {d.save}
        </button>
      </div>
    </Modal>
  );
}
