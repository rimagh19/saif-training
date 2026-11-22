"use client";
import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { errorText, LANG_COOKIE, type Dict, type Lang } from "@/lib/i18n";

const Ctx = createContext<{ lang: Lang; d: Dict } | null>(null);

export function I18nProvider({ lang, dict, children }: { lang: Lang; dict: Dict; children: React.ReactNode }) {
  return <Ctx.Provider value={{ lang, d: dict }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("I18nProvider missing");
  return { ...c, err: (code?: string) => errorText(c.d, code) };
}

export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, d } = useI18n();
  const router = useRouter();
  return (
    <button
      type="button"
      className={`btn btn-ghost text-sm ${className}`}
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${lang === "ar" ? "en" : "ar"}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      <Languages size={16} />
      {d.switch_lang}
    </button>
  );
}
