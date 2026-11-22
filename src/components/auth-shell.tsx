import Link from "next/link";
import { Logo } from "./logo";
import { LangSwitch } from "./i18n";
import type { Dict } from "@/lib/i18n";

export function AuthShell({ d, children }: { d: Dict; children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="relative hidden lg:flex flex-col justify-between bg-navy text-white p-12 overflow-hidden">
        <div className="absolute -bottom-24 -start-24 w-[28rem] h-[28rem] rounded-full border border-gold/20" />
        <div className="absolute -bottom-40 -start-40 w-[40rem] h-[40rem] rounded-full border border-gold/10" />
        <div className="flex items-center gap-3 text-gold-light">
          <span className="text-sm tracking-[0.3em]">S A F E</span>
        </div>
        <div className="relative animate-fade-up">
          <Logo height={110} />
          <h1 className="mt-10 text-4xl gold-text">{d.app_name}</h1>
          <p className="mt-3 text-silver max-w-md">{d.brand_sub}</p>
        </div>
        <div className="h-1 w-24 gold-sheen rounded" />
      </aside>
      <main className="flex flex-col bg-sand/40">
        <div className="flex items-center justify-between p-4">
          <div className="lg:hidden flex items-center gap-2">
            <Logo height={28} />
          </div>
          <div className="ms-auto flex items-center gap-1">
            <Link href="/join" className="btn btn-ghost text-sm">{d.trainee_entry}</Link>
            <LangSwitch />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md animate-fade-up">{children}</div>
        </div>
      </main>
    </div>
  );
}
