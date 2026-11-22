"use client";
import { useId, useState } from "react";
import { Tag, X } from "lucide-react";
import { useI18n } from "./i18n";

export type BankMetaDraft = { domain: string; specialty: string; topic: string; tags: string[] };
export type Suggestions = { domains: string[]; specialties: string[]; topics: string[]; tags: string[] };

export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const { d } = useI18n();
  const [text, setText] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const t = raw.replace(/^#/, "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < 20) onChange([...value, t]);
    setText("");
  };
  return (
    <div className="field !p-1.5 flex flex-wrap items-center gap-1.5 min-h-11">
      {value.map((t) => (
        <span key={t} className="badge bg-gold/15 text-bronze py-1">
          <Tag size={12} /> {t}
          <button type="button" aria-label={`${d.delete} ${t}`} className="hover:text-navy" onClick={() => onChange(value.filter((v) => v !== t))}><X size={13} /></button>
        </span>
      ))}
      <input
        list={listId}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,،]$/.test(v)) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
        placeholder={value.length ? "" : d.tags_ph}
        className="flex-1 min-w-32 outline-none px-1.5 py-1 bg-transparent"
        aria-label={d.tags}
      />
      <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

/** Domain / specialty / topic / tags — free text with suggestions from the trainer's own library. */
export function BankFields({ value, onChange, suggestions }: { value: BankMetaDraft; onChange: (v: BankMetaDraft) => void; suggestions: Suggestions }) {
  const { d } = useI18n();
  const id = useId();
  const field = (k: "domain" | "specialty" | "topic", label: string, list: string[]) => (
    <div>
      <label className="label" htmlFor={`${id}-${k}`}>{label}</label>
      <input id={`${id}-${k}`} list={`${id}-${k}-l`} className="field" maxLength={100} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
      <datalist id={`${id}-${k}-l`}>{list.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
  return (
    <div className="space-y-4">
      <h4 className="font-bold text-bronze">{d.classification}</h4>
      <div className="grid sm:grid-cols-3 gap-3">
        {field("domain", d.domain, suggestions.domains)}
        {field("specialty", d.specialty, suggestions.specialties)}
        {field("topic", d.topic, suggestions.topics)}
      </div>
      <div>
        <span className="label">{d.tags}</span>
        <TagInput value={value.tags} onChange={(tags) => onChange({ ...value, tags })} suggestions={suggestions.tags} />
      </div>
    </div>
  );
}
