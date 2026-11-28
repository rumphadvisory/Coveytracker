"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WaitlistRole } from "@/types/database";
import Icon from "./Icon";

const ACRES = ["Under 500", "500–1,500", "1,500–5,000", "5,000–15,000", "15,000+"];
const ROLES: [WaitlistRole, string][] = [
  ["owner", "Owner"],
  ["manager", "Plantation / land manager"],
  ["dog_man", "Dog man / handler"],
  ["other", "Other"],
];

export default function WaitlistForm() {
  const [f, setF] = useState({ name: "", email: "", property_name: "", state: "", acres: "", role: "", heard_from: "" });
  const [trap, setTrap] = useState(""); // hidden field: people never fill it in, bots usually do
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "new" | "repeat">(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (trap) return setDone("new");
    setBusy(true);
    const { error } = await createClient()
      .from("waitlist")
      .insert({
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        property_name: f.property_name.trim() || null,
        state: f.state.trim() || null,
        acres: f.acres || null,
        role: (f.role || null) as WaitlistRole | null,
        heard_from: f.heard_from.trim() || null,
      });
    setBusy(false);
    if (!error) return setDone("new");
    if (error.code === "23505") return setDone("repeat"); // already on the list
    setError(
      /fetch|network|load failed/i.test(error.message)
        ? "No connection right now. Please try again in a moment."
        : "Something went wrong saving your spot. Please try again, or email us.",
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Icon name="check_circle" className="text-5xl text-forest" fill />
        <h3 className="h-section">{done === "repeat" ? "You're already on the list" : "You're on the list"}</h3>
        <p className="max-w-sm text-sm text-bark">
          Thanks{f.name ? `, ${f.name.split(" ")[0]}` : ""}. We&apos;re adding plantations to the private beta a few at a
          time and will reach out at <strong>{f.email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="wl-name">
            Name
          </label>
          <input id="wl-name" className="input" required autoComplete="name" value={f.name} onChange={set("name")} />
        </div>
        <div>
          <label className="label" htmlFor="wl-email">
            Email
          </label>
          <input
            id="wl-email"
            className="input"
            type="email"
            required
            autoComplete="email"
            value={f.email}
            onChange={set("email")}
          />
        </div>
        <div>
          <label className="label" htmlFor="wl-prop">
            Plantation / property
          </label>
          <input id="wl-prop" className="input" value={f.property_name} onChange={set("property_name")} />
        </div>
        <div>
          <label className="label" htmlFor="wl-state">
            State
          </label>
          <input id="wl-state" className="input" autoComplete="address-level1" value={f.state} onChange={set("state")} />
        </div>
        <div>
          <label className="label" htmlFor="wl-acres">
            Approximate acres
          </label>
          <select id="wl-acres" className="input" value={f.acres} onChange={set("acres")}>
            <option value="">Choose…</option>
            {ACRES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="wl-role">
            Your role
          </label>
          <select id="wl-role" className="input" value={f.role} onChange={set("role")}>
            <option value="">Choose…</option>
            {ROLES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="wl-heard">
          How did you hear about us? <span className="font-normal normal-case text-bark/70">(optional)</span>
        </label>
        <input id="wl-heard" className="input" value={f.heard_from} onChange={set("heard_from")} />
      </div>
      {/* Spam trap, hidden from people and screen readers. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-px w-px opacity-0"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        <Icon name="how_to_reg" /> {busy ? "Saving your spot…" : "Join the waiting list"}
      </button>
      <p className="text-center text-xs text-bark">We&apos;ll only use your email to contact you about CoveyTracker.</p>
    </form>
  );
}
