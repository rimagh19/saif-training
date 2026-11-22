"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Clock, Download, Filter, Layers, Pencil, Plus, Search, Tag, X } from "lucide-react";
import { useI18n } from "./i18n";
import { api, ApiError } from "./api";
import { ImportDialog, type CourseWithActivities } from "./import-dialog";
import { optionText, typeLabel } from "./question-editor";
import { QUESTION_TYPES } from "@/lib/questions";
import type { BankFacets, BankQuestion } from "@/lib/bank";
import type { Dict } from "@/lib/i18n";

type Filters = {
  q: string;
  domain: string;
  specialty: string;
  topic: string;
  difficulty: string;
  type: string;
  tag: string[];
  status: "active" | "archived";
  sort: "recent" | "usage" | "title" | "oldest";
};
const EMPTY: Filters = { q: "", domain: "", specialty: "", topic: "", difficulty: "", type: "", tag: [], status: "active", sort: "recent" };
const PAGE = 30;

function toQuery(f: Filters, offset = 0) {
  const p = new URLSearchParams();
  for (const k of ["q", "domain", "specialty", "topic", "difficulty", "type", "status", "sort"] as const) if (f[k]) p.set(k, f[k]);
  f.tag.forEach((t) => p.append("tag", t));
  if (offset) p.set("offset", String(offset));
  p.set("limit", String(PAGE));
  return p.toString();
}

export function LibraryBrowser({ initialFacets, courses, initialFilters }: { initialFacets: BankFacets; courses: CourseWithActivities[]; initialFilters: Partial<Filters> }) {
  const { d, err } = useI18n();
  const [f, setF] = useState<Filters>({ ...EMPTY, ...initialFilters });
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState(initialFacets);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importIds, setImportIds] = useState<number[] | null>(null);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [version, setVersion] = useState(0);

  const set = (patch: Partial<Filters>) => {
    setF((p) => ({ ...p, ...patch }));
    setSelected(new Set());
  };

  // keep the URL shareable / restorable
  useEffect(() => {
    const qs = toQuery(f).replace(/&?limit=\d+/, "");
    window.history.replaceState(null, "", qs ? `/library?${qs}` : "/library");
  }, [f]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api<{ items: BankQuestion[]; total: number }>(`/api/bank?${toQuery(f)}`);
        if (alive) {
          setItems(r.items);
          setTotal(r.total);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, f.q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [f, version]);

  useEffect(() => {
    api<BankFacets>(`/api/bank/facets?status=${f.status}`).then(setFacets).catch(() => {});
  }, [f.status, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const loadMore = async () => {
    const r = await api<{ items: BankQuestion[]; total: number }>(`/api/bank?${toQuery(f, items.length)}`);
    setItems((p) => [...p, ...r.items]);
  };

  const bulk = async (action: string, extra: Record<string, unknown> = {}) => {
    try {
      await api("/api/bank/bulk", "POST", { ids: [...selected], action, ...extra });
      setSelected(new Set());
      refresh();
    } catch (x) {
      setMsg(err(x instanceof ApiError ? x.code : undefined));
    }
  };

  const activeFilterCount = useMemo(
    () => [f.domain, f.specialty, f.topic, f.difficulty, f.type].filter(Boolean).length + f.tag.length,
    [f]
  );
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const libraryEmpty = facets.counts.active + facets.counts.archived === 0;

  const filterPanel = (
    <div className="space-y-5">
      <FacetSelect label={d.domain} value={f.domain} options={facets.domains} onChange={(v) => set({ domain: v })} d={d} />
      <FacetSelect label={d.specialty} value={f.specialty} options={facets.specialties} onChange={(v) => set({ specialty: v })} d={d} />
      <FacetSelect label={d.topic} value={f.topic} options={facets.topics} onChange={(v) => set({ topic: v })} d={d} />
      <div>
        <label className="label text-sm" htmlFor="f-diff">{d.difficulty}</label>
        <select id="f-diff" className="field" value={f.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
          <option value="">{d.all}</option>
          <option value="easy">{d.d_easy}</option>
          <option value="medium">{d.d_medium}</option>
          <option value="advanced">{d.d_advanced}</option>
        </select>
      </div>
      <div>
        <label className="label text-sm" htmlFor="f-type">{d.q_type}</label>
        <select id="f-type" className="field" value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">{d.all}</option>
          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{typeLabel(d, t)}</option>)}
        </select>
      </div>
      {facets.tags.length > 0 && (
        <div>
          <span className="label text-sm">{d.tags}</span>
          <div className="flex flex-wrap gap-1.5">
            {facets.tags.slice(0, 40).map((t) => {
              const on = f.tag.includes(t.value);
              return (
                <button
                  key={t.value}
                  onClick={() => set({ tag: on ? f.tag.filter((x) => x !== t.value) : [...f.tag, t.value] })}
                  className={`badge py-1 border transition-colors ${on ? "bg-gold text-white border-gold" : "bg-white border-silver hover:border-gold"}`}
                >
                  <Tag size={11} /> {t.value} <span className={`num text-xs ${on ? "text-white/80" : "text-platinum"}`}>{t.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {activeFilterCount > 0 && (
        <button className="btn btn-ghost text-sm w-full" onClick={() => set({ domain: "", specialty: "", topic: "", difficulty: "", type: "", tag: [] })}>
          <X size={15} /> {d.clear_filters}
        </button>
      )}
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[16rem_1fr] gap-6 items-start">
      <aside className="hidden lg:block card p-4 sticky top-4">{filterPanel}</aside>

      <section className="min-w-0 space-y-4">
        {/* search & tools */}
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-56">
            <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-platinum" />
            <input
              type="search"
              value={f.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder={d.lib_search_ph}
              className="field !ps-10"
              aria-label={d.search}
            />
          </div>
          <select className="field !w-auto" value={f.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })} aria-label="sort">
            <option value="recent">{d.sort_recent}</option>
            <option value="usage">{d.sort_usage}</option>
            <option value="title">{d.sort_title}</option>
            <option value="oldest">{d.sort_oldest}</option>
          </select>
          <button className="btn btn-outline lg:hidden" onClick={() => setShowFilters((v) => !v)}>
            <Filter size={16} /> {d.filters} {activeFilterCount > 0 && <span className="badge bg-gold text-white !px-2">{activeFilterCount}</span>}
          </button>
          <Link href="/library/new" className="btn btn-primary"><Plus size={18} /> {d.lib_new}</Link>
        </div>
        {showFilters && <div className="card p-4 lg:hidden">{filterPanel}</div>}

        {/* status tabs + count */}
        <div className="flex flex-wrap items-center gap-2">
          {(["active", "archived"] as const).map((st) => (
            <button key={st} onClick={() => set({ status: st })} className={`badge py-1.5 px-4 ${f.status === st ? "bg-navy text-white" : "bg-white border border-silver hover:border-gold"}`}>
              {st === "active" ? d.lib_active : d.lib_archived} <span className="num opacity-75">{facets.counts[st]}</span>
            </button>
          ))}
          <span className="text-sm text-platinum ms-auto num">{total} {d.results_n}</span>
          {items.length > 0 && (
            <label className="text-sm flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="accent-[#bc9a5f] w-4 h-4" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))} />
              {d.select_all}
            </label>
          )}
        </div>
        {msg && <p role="alert" className="card p-3 text-bronze font-bold">{msg}</p>}

        {/* results */}
        {loading && items.length === 0 ? (
          <div className="card p-10 text-center text-platinum">{d.loading}</div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="mx-auto mb-3 h-1 w-10 gold-sheen rounded" />
            <p className="text-platinum">{libraryEmpty ? d.lib_empty : d.lib_no_results}</p>
            {libraryEmpty ? (
              <Link href="/library/new" className="btn btn-primary mt-4"><Plus size={18} /> {d.lib_new}</Link>
            ) : (
              <button className="btn btn-outline mt-4" onClick={() => set({ ...EMPTY, status: f.status })}>{d.clear_filters}</button>
            )}
          </div>
        ) : (
          <ul className={`space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {items.map((q) => (
              <BankCard
                key={q.id}
                q={q}
                d={d}
                selected={selected.has(q.id)}
                onSelect={() => setSelected((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
                onTag={(t) => !f.tag.includes(t) && set({ tag: [...f.tag, t] })}
                onImport={() => setImportIds([q.id])}
                onArchive={async () => {
                  await api(`/api/bank/${q.id}`, "PATCH", { status: q.status === "archived" ? "active" : "archived" });
                  refresh();
                }}
              />
            ))}
          </ul>
        )}
        {items.length < total && (
          <button className="btn btn-outline w-full" onClick={loadMore}>
            {d.view} ({total - items.length})
          </button>
        )}
      </section>

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl bg-navy text-white p-2 shadow-2xl animate-pop">
            <span className="px-3 font-bold num">{selected.size} {d.selected_n}</span>
            {f.status === "active" && (
              <button className="btn btn-primary" onClick={() => setImportIds([...selected])}><Download size={17} /> {d.import_to_activity}</button>
            )}
            {tagDraft === null ? (
              <button className="btn !bg-white/10 hover:!bg-white/20" onClick={() => setTagDraft("")}><Tag size={16} /> {d.add_tag_selected}</button>
            ) : (
              <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); bulk("add_tag", { tag: tagDraft }); setTagDraft(null); }}>
                <input autoFocus className="field !py-1.5 !w-40 !text-navy" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder={d.tags_ph} />
                <button className="btn btn-primary !px-3">{d.add}</button>
              </form>
            )}
            {f.status === "active" ? (
              <button className="btn !bg-white/10 hover:!bg-white/20" onClick={() => bulk("archive")}><Archive size={16} /> {d.archive_selected}</button>
            ) : (
              <button className="btn !bg-white/10 hover:!bg-white/20" onClick={() => bulk("restore")}><ArchiveRestore size={16} /> {d.restore_selected}</button>
            )}
            <button className="btn btn-ghost !text-silver hover:!bg-white/10" onClick={() => { setSelected(new Set()); setTagDraft(null); }}>{d.clear_selection}</button>
          </div>
        </div>
      )}

      {importIds && <ImportDialog ids={importIds} courses={courses} onClose={() => setImportIds(null)} onDone={() => { setSelected(new Set()); refresh(); }} />}
    </div>
  );
}

function FacetSelect({ label, value, options, onChange, d }: { label: string; value: string; options: { value: string; count: number }[]; onChange: (v: string) => void; d: Dict }) {
  return (
    <div>
      <label className="label text-sm">{label}</label>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{d.all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.value} ({o.count})</option>)}
      </select>
    </div>
  );
}

function BankCard({ q, d, selected, onSelect, onTag, onImport, onArchive }: {
  q: BankQuestion; d: Dict; selected: boolean; onSelect: () => void; onTag: (t: string) => void; onImport: () => void; onArchive: () => void;
}) {
  const path = [q.domain, q.specialty, q.topic].filter(Boolean);
  const correct =
    q.type === "short" ? q.correct.join(" / ") : q.type === "order" ? q.options.map((o) => o.text).join(" ← ") : q.options.filter((o) => q.correct.includes(o.id)).map((o) => optionText(d, q.type, o)).join("، ");
  return (
    <li className={`card p-4 flex gap-3 transition-colors ${selected ? "border-gold bg-gold/5" : ""} ${q.status === "archived" ? "opacity-80" : ""}`}>
      <input type="checkbox" checked={selected} onChange={onSelect} className="mt-1.5 w-4 h-4 shrink-0 accent-[#bc9a5f]" aria-label={q.title || q.body} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs mb-1">
          <span className="badge bg-gold/15 text-bronze">{typeLabel(d, q.type)}</span>
          <span className="badge bg-sand">{d[`d_${q.difficulty}` as const]}</span>
          <span className="badge bg-sand num">{q.points} {d.points}</span>
          {q.status === "archived" && <span className="badge bg-navy/10 text-navy">{d.archived_badge}</span>}
          <span className="text-platinum flex items-center gap-1">
            <Layers size={12} /> {path.length ? path.join(" › ") : d.no_classification}
          </span>
        </div>
        <Link href={`/library/${q.id}`} className="font-bold text-lg hover:text-bronze leading-snug block">{q.title || q.body.slice(0, 160)}</Link>
        {q.title && q.body && <p className="text-sm text-navy/70 line-clamp-2">{q.body}</p>}
        {correct && <p className="text-sm mt-1 truncate"><span className="text-platinum">{d.correct_answer}: </span><span className="text-forest font-bold">{correct}</span></p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {q.tags.map((t) => (
            <button key={t} onClick={() => onTag(t)} className="badge bg-white border border-silver/80 text-bronze text-xs hover:border-gold"><Tag size={11} /> {t}</button>
          ))}
          <span className="ms-auto text-xs text-platinum flex items-center gap-3">
            <span>{d.used_in_n} <b className="num text-navy">{q.usage}</b> {d.activities_n}</span>
            <span className="num" dir="ltr">v{q.version}</span>
            <span className="flex items-center gap-1"><Clock size={12} />{new Date(q.updated_at).toLocaleDateString("en-GB")}</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {q.status === "active" && <button className="btn btn-ghost !p-1.5" title={d.import_to_activity} aria-label={d.import_to_activity} onClick={onImport}><Download size={17} /></button>}
        <Link className="btn btn-ghost !p-1.5" title={d.edit} aria-label={d.edit} href={`/library/${q.id}`}><Pencil size={17} /></Link>
        <button className="btn btn-ghost !p-1.5" title={q.status === "archived" ? d.restore_selected : d.archive_selected} aria-label={q.status === "archived" ? d.restore_selected : d.archive_selected} onClick={onArchive}>
          {q.status === "archived" ? <ArchiveRestore size={17} /> : <Archive size={17} />}
        </button>
      </div>
    </li>
  );
}
