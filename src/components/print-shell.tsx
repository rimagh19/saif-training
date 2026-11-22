import { Logo } from "./logo";
import { AutoPrint } from "./report-client";

export function PrintShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white min-h-screen p-8 print:p-0 max-w-[1100px] mx-auto">
      <style>{`@page { size: A4 landscape; margin: 12mm; } @media print { .card { border-color: #bfbfbf; break-inside: avoid; } }`}</style>
      <AutoPrint />
      <header className="flex items-center gap-4 border-b-2 border-gold pb-4 mb-6">
        <Logo height={48} />
        <div>
          <h1 className="text-2xl text-navy">{title}</h1>
          <p className="text-platinum">{subtitle}</p>
        </div>
      </header>
      {children}
    </div>
  );
}
