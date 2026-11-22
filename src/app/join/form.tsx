"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/components/i18n";

export function JoinCodeForm({ initial }: { initial: string }) {
  const { d, err } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const go = async (c: string) => {
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/play/${c}`, { cache: "no-store" });
    if (res.ok) {
      router.push(`/play/${c}`);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error === "activity_not_found" ? `${d.err_activity_not_found}. ${d.t_wrong_code}` : err(data.error));
    setBusy(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(code);
      }}
    >
      {/* one real input (works with paste, autofill and screen readers) drawn as 6 boxes */}
      <label className="relative block cursor-text" onClick={() => input.current?.focus()}>
        <span className="sr-only">{d.code}</span>
        <input
          ref={input}
          autoFocus={!initial}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            setError("");
            if (v.length === 6) go(v);
          }}
          className="absolute inset-0 w-full h-full opacity-0 text-[16px]"
          dir="ltr"
          aria-invalid={!!error}
        />
        <span className="grid grid-cols-6 gap-2" dir="ltr" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => {
            const filled = i < code.length;
            const active = i === Math.min(code.length, 5);
            return (
              <span
                key={i}
                className={`h-16 rounded-xl border-2 grid place-items-center text-3xl font-bold num transition-colors ${
                  error ? "border-bronze" : filled ? "border-gold bg-white" : active ? "border-navy bg-white" : "border-silver bg-white/70"
                }`}
              >
                {code[i] ?? ""}
              </span>
            );
          })}
        </span>
      </label>
      {error && <p role="alert" className="text-bronze font-bold mt-3 text-center">{error}</p>}
      <button className="btn btn-primary w-full mt-6 h-14 text-lg" disabled={busy || code.length !== 6}>
        {busy ? d.loading : d.continue} {!busy && <ArrowLeft size={20} className="ltr:rotate-180" />}
      </button>
    </form>
  );
}
