"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? "That sign-in link expired or was already used." : null);

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/field";

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = createClient();
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = createClient();
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
    else router.replace(safeNext);
  }

  if (sent) {
    return (
      <form onSubmit={verifyCode} className="space-y-3">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-forest">mark_email_read</span>
          <div>
            <h2 className="h-section">Check your email</h2>
            <p className="text-sm text-bark">
              We sent a sign-in link to <strong>{email}</strong>. Tap it on this device — or enter the code from the
              email below.
            </p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="code">
            Code
          </label>
          <input
            id="code"
            className="input tracking-[0.3em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || code.length < 6}>
          Verify code
        </button>
        <button type="button" className="btn-ghost w-full" onClick={() => setSent(false)}>
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendLink} className="space-y-3">
      <h2 className="h-section">Sign in</h2>
      <p className="text-sm text-bark">No password needed — we&apos;ll email you a sign-in link.</p>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@plantation.com"
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        <span className="material-symbols-outlined text-[20px]">send</span>
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
