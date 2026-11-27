"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Supabase's auth errors are terse; say what happened and what to do. */
export function friendlyAuthError(message: string, step: "send" | "verify"): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many sign-in emails have been sent in the last hour. Use the most recent email you received, or wait a bit and try again.";
  if (m.includes("only request this after"))
    return "A sign-in email was just sent. Wait a few seconds before asking for another one.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "New accounts are turned off for this app. Ask the person who runs it to turn on sign-ups.";
  if (step === "verify" && (m.includes("expired") || m.includes("invalid") || m.includes("token")))
    return "That code didn't work. It may have expired, or a newer email replaced it. Check the most recent email, or send a new one.";
  return message;
}

export default function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [showCode, setShowCode] = useState(false);
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
    if (error) setError(friendlyAuthError(error.message, "send"));
    else {
      setSent(true);
      setShowCode(false);
      setCode("");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = createClient();
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(friendlyAuthError(error.message, "verify"));
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
              We sent a sign-in link to <strong>{email}</strong>. Open the email on this phone and tap the link.
            </p>
          </div>
        </div>
        <p className="rounded-xl bg-sand p-3 text-xs text-bark">
          Didn&apos;t get it? Check your spam folder. If the link opens in a different browser and doesn&apos;t sign
          you in, copy this page&apos;s address into that browser and start again there.
        </p>

        {showCode ? (
          <>
            <div>
              <label className="label" htmlFor="code">
                Code from the email
              </label>
              <input
                id="code"
                className="input tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full" disabled={busy || code.length < 6}>
              {busy ? "Checking…" : "Sign in with code"}
            </button>
          </>
        ) : (
          <>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button type="button" className="btn-secondary w-full" onClick={() => setShowCode(true)}>
              <span className="material-symbols-outlined text-[20px]">pin</span>
              Have a code from the email? Enter it
            </button>
          </>
        )}
        <button type="button" className="btn-ghost w-full" onClick={() => (setSent(false), setError(null))}>
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendLink} className="space-y-3">
      <h2 className="h-section">Sign in</h2>
      <p className="text-sm text-bark">No password needed. We&apos;ll email you a link that signs you in.</p>
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
