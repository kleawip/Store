"use client";

import type { StaffSession } from "@kleawip/contract";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiProblem, setCsrfToken } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api<StaffSession>("/v1/admin/auth/login", { method: "POST", body: { email, password } });
      setCsrfToken(session.csrfToken);
      // Only follow internal paths after sign-in.
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/products");
    } catch (problem) {
      setError(problem instanceof ApiProblem ? problem.message : "Could not reach the admin API.");
      setBusy(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <Image src="/Kleawip-logo.webp" alt="Kleawip" width={138} height={38} priority />
      <div className="login-icon" aria-hidden><LockKeyhole size={20} /></div>
      <h1>Staff sign-in</h1>
      <p>Kleawip Operations is for Kleawip staff only. Accounts are created by the Owner.</p>
      <label>
        Work email
        <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Password
        <span className="password-field">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <small>Five failed attempts lock the account for 15 minutes. Sessions end after 30 minutes of inactivity.</small>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-page">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
