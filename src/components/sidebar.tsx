"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, BookOpen, GraduationCap, Home, LogOut, Menu, Radio, Settings, X } from "lucide-react";
import { Logo } from "./logo";
import { LangSwitch, useI18n } from "./i18n";
import { api } from "./api";

export function Sidebar({ name, liveCount }: { name: string; liveCount: number }) {
  const { d } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = [
    { href: "/dashboard", label: d.nav_home, icon: Home },
    { href: "/courses", label: d.nav_courses, icon: GraduationCap },
    { href: "/library", label: d.nav_library, icon: BookOpen },
    { href: "/activities", label: d.nav_activities, icon: Radio, badge: liveCount },
    { href: "/reports", label: d.nav_reports, icon: BarChart3 },
    { href: "/settings", label: d.nav_settings, icon: Settings },
  ];
  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
              active ? "bg-gold/15 text-gold-light" : "text-silver hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className={`h-5 w-0.5 rounded ${active ? "bg-gold" : "bg-transparent"}`} />
            <Icon size={19} className={active ? "text-gold" : ""} />
            <span className="font-bold">{it.label}</span>
            {!!it.badge && <span className="ms-auto badge bg-gold text-white">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
  const footer = (
    <div className="border-t border-white/10 pt-4 mt-4 space-y-2">
      <div className="px-3 text-sm text-silver truncate">{name}</div>
      <div className="flex items-center justify-between">
        <LangSwitch className="!text-silver hover:!bg-white/5 hover:!text-white" />
        <button
          className="btn btn-ghost text-sm !text-silver hover:!bg-white/5 hover:!text-white"
          onClick={async () => {
            await api("/api/auth/logout", "POST");
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut size={16} />
          {d.logout}
        </button>
      </div>
    </div>
  );
  const brand = (
    <Link href="/dashboard" className="flex items-center gap-3 px-2 mb-8">
      <Logo height={34} />
      <div className="leading-tight">
        <div className="text-white font-bold">{d.app_short}</div>
        <div className="text-xs text-gold-light tracking-wider">{d.brand_sub}</div>
      </div>
    </Link>
  );
  return (
    <>
      <aside className="no-print hidden lg:flex fixed inset-y-0 start-0 w-64 flex-col bg-navy p-4 z-30">
        {brand}
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {footer}
      </aside>
      <header className="no-print lg:hidden sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo height={26} />
          <span className="text-white font-bold">{d.app_short}</span>
        </Link>
        <button className="text-white p-1" aria-label="menu" onClick={() => setOpen(true)}>
          <Menu />
        </button>
      </header>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 bg-navy p-4 flex flex-col animate-fade-up">
            <button className="self-end text-white mb-2" aria-label="close" onClick={() => setOpen(false)}>
              <X />
            </button>
            {brand}
            <div className="flex-1">{nav}</div>
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
