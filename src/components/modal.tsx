"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy/60" onClick={onClose} />
      <div className={`relative w-full ${wide ? "sm:max-w-4xl" : "sm:max-w-lg"} max-h-[92dvh] flex flex-col bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl animate-pop`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-silver/50">
          <h2 className="text-xl">{title}</h2>
          <button className="btn btn-ghost !p-1.5" onClick={onClose} aria-label="close"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
