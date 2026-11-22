"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";
import { useI18n } from "./i18n";

function useSubmit() {
  const { d, err } = useI18n();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: d.saved });
      return true;
    } catch (x) {
      setMsg({ ok: false, text: err(x instanceof ApiError ? x.code : undefined) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const view = msg && <p className={`font-bold ${msg.ok ? "text-forest" : "text-bronze"}`}>{msg.text}</p>;
  return { run, busy, view, d };
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const { run, busy, view, d } = useSubmit();
  const router = useRouter();
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); if (await run(() => api("/api/settings/profile", "PATCH", f))) router.refresh(); }}>
      <div><label className="label" htmlFor="p-name">{d.full_name}</label><input id="p-name" name="name" defaultValue={name} required className="field" /></div>
      <div><label className="label" htmlFor="p-email">{d.email}</label><input id="p-email" name="email" type="email" defaultValue={email} required className="field" dir="ltr" /></div>
      {view}
      <button className="btn btn-primary" disabled={busy}>{d.save}</button>
    </form>
  );
}

export function PasswordForm() {
  const { run, busy, view, d } = useSubmit();
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); if (await run(() => api("/api/settings/password", "POST", { current: f.get("current"), next: f.get("next") }))) form.reset(); }}>
      <div><label className="label" htmlFor="pw-c">{d.current_password}</label><input id="pw-c" name="current" type="password" required className="field" dir="ltr" autoComplete="current-password" /></div>
      <div><label className="label" htmlFor="pw-n">{d.new_password}</label><input id="pw-n" name="next" type="password" minLength={8} required className="field" dir="ltr" autoComplete="new-password" /></div>
      {view}
      <button className="btn btn-primary" disabled={busy}>{d.save}</button>
    </form>
  );
}

export function AddTrainerForm() {
  const { run, busy, view, d } = useSubmit();
  const router = useRouter();
  return (
    <form className="grid sm:grid-cols-3 gap-2" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = Object.fromEntries(new FormData(form)); if (await run(() => api("/api/trainers", "POST", f))) { form.reset(); router.refresh(); } }}>
      <input name="name" required placeholder={d.full_name} className="field" />
      <input name="email" type="email" required placeholder={d.email} className="field" dir="ltr" />
      <input name="password" type="password" minLength={8} required placeholder={d.password} className="field" dir="ltr" autoComplete="new-password" />
      <div className="sm:col-span-3 flex items-center gap-3"><button className="btn btn-dark" disabled={busy}>{d.add_trainer}</button>{view}</div>
    </form>
  );
}
