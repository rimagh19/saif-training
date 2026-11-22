"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/components/api";
import { useI18n } from "@/components/i18n";

export function SetupForm() {
  const { d, err } = useI18n();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("password") !== f.get("password2")) return setError(d.err_password_mismatch);
        setBusy(true);
        setError("");
        try {
          await api("/api/auth/setup", "POST", { name: f.get("name"), email: f.get("email"), password: f.get("password") });
          router.replace("/dashboard");
          router.refresh();
        } catch (x) {
          setError(err(x instanceof ApiError ? x.code : undefined));
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="name">{d.full_name}</label>
        <input id="name" name="name" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="email">{d.email}</label>
        <input id="email" name="email" type="email" required className="field" dir="ltr" />
      </div>
      <div>
        <label className="label" htmlFor="password">{d.password}</label>
        <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="field" dir="ltr" />
      </div>
      <div>
        <label className="label" htmlFor="password2">{d.password_confirm}</label>
        <input id="password2" name="password2" type="password" minLength={8} required autoComplete="new-password" className="field" dir="ltr" />
      </div>
      {error && <p role="alert" className="text-bronze font-bold">{error}</p>}
      <button className="btn btn-primary w-full py-3 text-lg" disabled={busy}>{d.create_account}</button>
    </form>
  );
}
