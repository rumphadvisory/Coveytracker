"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import PropertyFields, { coordsError, parseCoord, type PropertyValues } from "@/components/PropertyForm";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data";

type Step = "property" | "roster" | "team";

function QuickList({
  label,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const [v, setV] = useState("");
  return (
    <div>
      <span className="label">{label}</span>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onAdd(v.trim());
          setV("");
        }}
      >
        <input className="input" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn-secondary" aria-label={`Add ${label}`}>
          <Icon name="add" />
        </button>
      </form>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((x, i) => (
            <span key={`${x}-${i}`} className="chip">
              {x}
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${x}`}>
                <Icon name="close" className="text-[16px]" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const sb = createClient();
  const router = useRouter();
  const [step, setStep] = useState<Step>("property");
  const [values, setValues] = useState<PropertyValues>({ name: "", lat: "", lng: "" });
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [courses, setCourses] = useState<string[]>([]);
  const [dogs, setDogs] = useState<string[]>([]);
  const [invite, setInvite] = useState({ email: "", role: "handler" as "handler" | "manager" });
  const [invited, setInvited] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasOthers, setHasOthers] = useState(false);

  useEffect(() => {
    // Pick up invites first — an invited user shouldn't have to create a property.
    (async () => {
      const { data: accepted } = await sb.rpc("accept_pending_invites");
      const { count } = await sb.from("property_members").select("id", { count: "exact", head: true });
      if ((accepted ?? 0) > 0) router.replace("/field");
      else setHasOthers((count ?? 0) > 0);
    })();
  }, [sb, router]);

  async function createProperty(e: React.FormEvent) {
    e.preventDefault();
    const bad = coordsError(values);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    const { data: auth } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("properties")
      .insert({
        name: values.name.trim(),
        lat: parseCoord(values.lat, 90),
        lng: parseCoord(values.lng, 180),
        owner_id: auth.user!.id,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setPropertyId(data.id);
    try {
      localStorage.setItem("ct:propertyId", data.id);
    } catch {}
    setStep("roster");
  }

  async function saveRoster() {
    if (!propertyId) return;
    setBusy(true);
    setError(null);
    try {
      if (courses.length) {
        const { error } = await sb.from("courses").insert(courses.map((name) => ({ name, property_id: propertyId })));
        if (error) throw error;
      }
      if (dogs.length) {
        const { error } = await sb.from("dogs").insert(dogs.map((name) => ({ name, property_id: propertyId })));
        if (error) throw error;
      }
      setStep("team");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !invite.email.trim()) return;
    setBusy(true);
    setError(null);
    const email = invite.email.trim().toLowerCase();
    const { error } = await sb.from("property_invites").insert({ property_id: propertyId, email, role: invite.role });
    setBusy(false);
    if (error) return setError(error.message);
    setInvited((l) => [...l, `${email} (${invite.role})`]);
    setInvite({ ...invite, email: "" });
  }

  const steps: Step[] = ["property", "roster", "team"];

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Image src="/logo.png" alt="" width={48} height={48} className="h-12 w-12 object-contain" />
        <div>
          <h1 className="h-page">Set up your property</h1>
          <p className="text-sm text-bark">Step {steps.indexOf(step) + 1} of 3</p>
        </div>
      </div>

      {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {step === "property" && (
        <form onSubmit={createProperty} className="card space-y-4">
          <PropertyFields values={values} onChange={setValues} />
          <button className="btn-primary w-full" disabled={busy || !values.name.trim()}>
            Create property <Icon name="arrow_forward" />
          </button>
          {hasOthers && (
            <Link href="/field" className="btn-ghost w-full">
              Cancel
            </Link>
          )}
        </form>
      )}

      {step === "roster" && (
        <div className="card space-y-4">
          <QuickList
            label="Courses"
            placeholder="e.g. Big Woods"
            items={courses}
            onAdd={(v) => setCourses((l) => [...l, v])}
            onRemove={(i) => setCourses((l) => l.filter((_, j) => j !== i))}
          />
          <QuickList
            label="Dogs"
            placeholder="e.g. Belle"
            items={dogs}
            onAdd={(v) => setDogs((l) => [...l, v])}
            onRemove={(i) => setDogs((l) => l.filter((_, j) => j !== i))}
          />
          <p className="text-xs text-bark">You can add more later in Manage.</p>
          <button className="btn-primary w-full" onClick={saveRoster} disabled={busy}>
            {courses.length || dogs.length ? "Save & continue" : "Skip for now"} <Icon name="arrow_forward" />
          </button>
        </div>
      )}

      {step === "team" && (
        <div className="card space-y-4">
          <form onSubmit={sendInvite} className="space-y-2">
            <span className="label">Invite your team</span>
            <input
              type="email"
              className="input"
              placeholder="handler@plantation.com"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
            />
            <div className="flex gap-2">
              <select
                className="input"
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value as "handler" | "manager" })}
              >
                <option value="handler">Handler — log hunts &amp; marks</option>
                <option value="manager">Manager — also manage dogs/courses</option>
              </select>
              <button className="btn-secondary" disabled={busy}>
                Invite
              </button>
            </div>
          </form>
          {invited.length > 0 && (
            <ul className="space-y-1 text-sm">
              {invited.map((x) => (
                <li key={x} className="flex items-center gap-1 text-forest-dark">
                  <Icon name="check" className="text-[18px]" /> {x}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-bark">
            Invitees just sign in at this site with that email — they&apos;ll be added to your property automatically.
          </p>
          <button className="btn-primary w-full" onClick={() => router.replace("/field")}>
            <Icon name="check_circle" /> Ready to hunt
          </button>
        </div>
      )}
    </main>
  );
}
