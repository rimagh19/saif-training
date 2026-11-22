import { Logo } from "./logo";
import { LangSwitch } from "./i18n";

/** Phone-first frame for every trainee screen: no navigation, no links to anything else. */
export function TraineeShell({ children, title, subtitle, footer }: { children: React.ReactNode; title?: string; subtitle?: string; footer?: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-sand/60">
      <header className="sticky top-0 z-20 bg-navy text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto max-w-md flex items-center gap-3 px-4 h-14">
          <Logo height={26} />
          <div className="min-w-0 flex-1 leading-tight">
            {title && <div className="font-bold truncate">{title}</div>}
            {subtitle && <div className="text-xs text-silver truncate">{subtitle}</div>}
          </div>
          <LangSwitch className="!px-2 !text-silver hover:!bg-white/10 hover:!text-white text-xs" />
        </div>
        <div className="h-0.5 gold-sheen" />
      </header>
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-6 flex flex-col">{children}</main>
      {footer && (
        <div className="sticky bottom-0 z-20 bg-gradient-to-t from-sand via-sand/95 to-sand/0 pt-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto max-w-md px-4">{footer}</div>
        </div>
      )}
    </div>
  );
}
