import Link from "next/link";
import type { Dict } from "@/lib/i18n";

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="text-sm text-platinum hover:text-bronze">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3 mt-1">
        <div>
          <h1 className="text-3xl text-navy">{title}</h1>
          {subtitle && <div className="text-platinum mt-1">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-4 h-0.5 w-16 gold-sheen rounded" />
    </div>
  );
}

export function StatCard({ label, value, icon, hint }: { label: string; value: React.ReactNode; icon?: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card p-5 flex items-start justify-between gap-3">
      <div>
        <div className="text-platinum text-sm font-bold">{label}</div>
        <div className="text-3xl font-bold text-navy mt-1 num">{value}</div>
        {hint && <div className="text-xs text-platinum mt-1">{hint}</div>}
      </div>
      {icon && <div className="rounded-xl bg-sand text-bronze p-2.5">{icon}</div>}
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-3 h-1 w-10 gold-sheen rounded" />
      <p className="text-platinum">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const courseStatusClass: Record<string, string> = {
  draft: "bg-silver/30 text-platinum",
  active: "bg-forest/10 text-forest",
  completed: "bg-gold/15 text-bronze",
  archived: "bg-navy/10 text-navy",
};
export function CourseStatus({ status, d }: { status: string; d: Dict }) {
  const label = d[`st_${status}` as keyof Dict] ?? status;
  return <span className={`badge ${courseStatusClass[status] ?? ""}`}>{label}</span>;
}

export function ActivityStatus({ status, d }: { status: string; d: Dict }) {
  if (status === "live")
    return (
      <span className="badge bg-forest text-white">
        <span className="h-2 w-2 rounded-full bg-gold-light animate-pulse" />
        {d.act_live}
      </span>
    );
  return <span className={`badge ${status === "ended" ? "bg-sand text-bronze" : "bg-silver/30 text-platinum"}`}>{status === "ended" ? d.act_ended : d.act_draft}</span>;
}

export function ModeBadge({ mode, d }: { mode: string; d: Dict }) {
  return <span className="badge border border-gold/40 text-bronze">{mode === "remote" ? d.mode_remote : d.mode_onsite}</span>;
}

export function Bar({ value, tone = "gold" }: { value: number; tone?: "gold" | "forest" | "bronze" }) {
  const c = tone === "forest" ? "bg-forest" : tone === "bronze" ? "bg-bronze" : "bg-gold";
  return (
    <div className="h-2 w-full rounded-full bg-sand overflow-hidden">
      <div className={`h-full ${c} rounded-full transition-[width] duration-500`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function fmtDate(ts: number | string | null | undefined, lang: string) {
  if (!ts) return "—";
  const dt = typeof ts === "number" ? new Date(ts) : new Date(ts + "T00:00:00");
  return dt.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
}
export function fmtDateTime(ts: number | null | undefined, lang: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
