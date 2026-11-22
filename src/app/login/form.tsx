"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/components/api";
import { useI18n } from "@/components/i18n";

export function LoginForm() {
  const { d, err } = useI18n();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await api("/api/auth/login", "POST", { email: f.get("email"), password: f.get("password") });
          router.replace("/dashboard");
          router.refresh();
        } catch (x) {
          setError(err(x instanceof ApiError ? x.code : undefined));
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="email">{d.email}</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="field" dir="ltr" />
      </div>
      <div>
        <label className="label" htmlFor="password">{d.password}</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="field" dir="ltr" />
      </div>
      {error && <p role="alert" className="text-bronze font-bold">{error}</p>}
      <button className="btn btn-primary w-full py-3 text-lg" disabled={busy}>{d.sign_in}</button>
    </form>
  );
}
