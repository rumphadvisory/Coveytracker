"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import PropertyFields, { parseCoord, type PropertyValues } from "@/components/PropertyForm";
import { clearLocalCache, useProperty } from "@/components/PropertyProvider";
import { loadQueue } from "@/lib/markQueue";
import { ErrorNote, PageHeader } from "@/components/ui";
import type { MemberListRow, PropertyInviteRow, Role } from "@/types/database";

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="h-section flex items-center gap-2">
        <Icon name={icon} className="text-forest" /> {title}
      </h2>
      {children}
    </section>
  );
}

export default function ManagePage() {
  const { sb, user, property, role, canManage, isOwner, dogs, courses, reloadRoster, reloadMemberships } = useProperty();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Property settings
  const [values, setValues] = useState<PropertyValues>({
    name: property.name,
    lat: property.lat?.toString() ?? "",
    lng: property.lng?.toString() ?? "",
  });
  useEffect(() => {
    setValues({ name: property.name, lat: property.lat?.toString() ?? "", lng: property.lng?.toString() ?? "" });
  }, [property]);

  async function saveProperty(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await sb
      .from("properties")
      .update({ name: values.name.trim(), lat: parseCoord(values.lat, 90), lng: parseCoord(values.lng, 180) })
      .eq("id", property.id);
    if (error) return setError(error.message);
    setNotice("Property saved");
    reloadMemberships();
  }

  // Dogs & courses
  const [dogName, setDogName] = useState("");
  const [course, setCourse] = useState({ name: "", acres: "" });

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error } = await p;
    if (error) setError(error.message);
    await reloadRoster();
    return !error;
  }

  // Team
  const [members, setMembers] = useState<MemberListRow[]>([]);
  const [invites, setInvites] = useState<PropertyInviteRow[]>([]);
  const [invite, setInvite] = useState<{ email: string; role: "handler" | "manager" }>({ email: "", role: "handler" });

  const loadTeam = useCallback(async () => {
    const [m, i] = await Promise.all([
      sb.rpc("property_member_list", { p_property: property.id }),
      sb.from("property_invites").select("*").eq("property_id", property.id).order("created_at"),
    ]);
    setMembers((m.data as MemberListRow[] | null) ?? []);
    setInvites(i.data ?? []);
  }, [sb, property.id]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = invite.email.trim().toLowerCase();
    if (!email) return;
    setError(null);
    const { error } = await sb.from("property_invites").insert({ property_id: property.id, email, role: invite.role });
    if (error) return setError(error.message);
    setInvite({ ...invite, email: "" });
    setNotice(`Invited ${email}. They'll join when they sign in with that email.`);
    loadTeam();
  }

  async function changeRole(id: string, r: Role) {
    const { error } = await sb.from("property_members").update({ role: r }).eq("id", id);
    if (error) setError(error.message);
    loadTeam();
  }

  async function removeMember(m: MemberListRow) {
    if (!confirm(`Remove ${m.email} from ${property.name}?`)) return;
    const { error } = await sb.from("property_members").delete().eq("id", m.id);
    if (error) setError(error.message);
    loadTeam();
  }

  // Danger zone
  const [confirmName, setConfirmName] = useState("");
  async function clearHunts() {
    if (confirmName !== property.name) return;
    const { error } = await sb.rpc("clear_hunt_data", { p_property: property.id });
    if (error) return setError(error.message);
    setConfirmName("");
    setNotice("All hunts and GPS marks were deleted.");
  }

  return (
    <>
      <PageHeader title="Manage" icon="settings" />
      <ErrorNote error={error} />
      {notice && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-forest-light p-3 text-sm text-forest-dark">
          <Icon name="check_circle" /> {notice}
          <button className="ml-auto" onClick={() => setNotice(null)} aria-label="Dismiss">
            <Icon name="close" />
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Dogs" icon="pets">
          {canManage && (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!dogName.trim()) return;
                if (await run(sb.from("dogs").insert({ property_id: property.id, name: dogName.trim() }))) setDogName("");
              }}
            >
              <input className="input" placeholder="Dog name" value={dogName} onChange={(e) => setDogName(e.target.value)} />
              <button className="btn-primary" aria-label="Add dog">
                <Icon name="add" />
              </button>
            </form>
          )}
          <ul className="divide-y divide-line">
            {dogs.length === 0 && <li className="py-2 text-sm text-bark">No dogs yet.</li>}
            {dogs.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <span className={`flex-1 font-medium ${d.active ? "" : "text-bark line-through"}`}>{d.name}</span>
                {canManage && (
                  <>
                    <button
                      className="btn-ghost min-h-0 py-1 text-xs"
                      onClick={() => run(sb.from("dogs").update({ active: !d.active }).eq("id", d.id))}
                    >
                      {d.active ? "Retire" : "Reactivate"}
                    </button>
                    <button
                      className="p-1 text-bark"
                      aria-label={`Delete ${d.name}`}
                      onClick={() =>
                        confirm(`Delete ${d.name}? Their contact history on past hunts is deleted too. Retire instead to keep history.`) &&
                        run(sb.from("dogs").delete().eq("id", d.id))
                      }
                    >
                      <Icon name="delete" className="text-[20px]" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Courses" icon="landscape">
          {canManage && (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!course.name.trim()) return;
                const acres = parseFloat(course.acres);
                if (
                  await run(
                    sb.from("courses").insert({
                      property_id: property.id,
                      name: course.name.trim(),
                      acres: Number.isFinite(acres) ? acres : null,
                    }),
                  )
                )
                  setCourse({ name: "", acres: "" });
              }}
            >
              <input className="input" placeholder="Course name" value={course.name} onChange={(e) => setCourse({ ...course, name: e.target.value })} />
              <input
                className="input w-24"
                placeholder="Acres"
                inputMode="decimal"
                value={course.acres}
                onChange={(e) => setCourse({ ...course, acres: e.target.value })}
              />
              <button className="btn-primary" aria-label="Add course">
                <Icon name="add" />
              </button>
            </form>
          )}
          <ul className="divide-y divide-line">
            {courses.length === 0 && <li className="py-2 text-sm text-bark">No courses yet.</li>}
            {courses.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 font-medium">{c.name}</span>
                {c.acres != null && <span className="text-xs text-bark">{c.acres} ac</span>}
                {canManage && (
                  <button
                    className="p-1 text-bark"
                    aria-label={`Delete ${c.name}`}
                    onClick={() =>
                      confirm(`Delete course ${c.name}? Past hunts stay but lose their course.`) &&
                      run(sb.from("courses").delete().eq("id", c.id))
                    }
                  >
                    <Icon name="delete" className="text-[20px]" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Property" icon="home_work">
          <form onSubmit={saveProperty} className="space-y-3">
            <PropertyFields values={values} onChange={setValues} disabled={!canManage} />
            {canManage && <button className="btn-primary w-full">Save property</button>}
          </form>
          <Link href="/onboarding" className="btn-ghost w-full text-sm">
            <Icon name="add_home_work" /> Add another property
          </Link>
        </Section>

        <Section title="Team" icon="group">
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {m.email}
                  {m.user_id === user.id && <span className="text-bark"> (you)</span>}
                </span>
                {isOwner && m.role !== "owner" ? (
                  <>
                    <select className="input w-auto py-1 text-xs" value={m.role} onChange={(e) => changeRole(m.id, e.target.value as Role)}>
                      <option value="manager">manager</option>
                      <option value="handler">handler</option>
                    </select>
                    <button className="p-1 text-bark" aria-label={`Remove ${m.email}`} onClick={() => removeMember(m)}>
                      <Icon name="person_remove" className="text-[20px]" />
                    </button>
                  </>
                ) : (
                  <span className="pill">{m.role}</span>
                )}
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-2 text-sm text-bark">
                <span className="min-w-0 flex-1 truncate">{i.email}</span>
                <span className="pill">invited · {i.role}</span>
                {isOwner && (
                  <button
                    className="p-1"
                    aria-label={`Revoke invite for ${i.email}`}
                    onClick={async () => {
                      await sb.from("property_invites").delete().eq("id", i.id);
                      loadTeam();
                    }}
                  >
                    <Icon name="close" className="text-[20px]" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isOwner && (
            <form onSubmit={sendInvite} className="space-y-2">
              <input
                type="email"
                className="input"
                placeholder="Invite by email"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              />
              <div className="flex gap-2">
                <select
                  className="input"
                  value={invite.role}
                  onChange={(e) => setInvite({ ...invite, role: e.target.value as "handler" | "manager" })}
                >
                  <option value="handler">Handler</option>
                  <option value="manager">Manager</option>
                </select>
                <button className="btn-primary">
                  <Icon name="person_add" /> Invite
                </button>
              </div>
              <p className="text-xs text-bark">
                Share this site&apos;s address with them. When they sign in with the invited email they&apos;re added
                automatically.
              </p>
            </form>
          )}
        </Section>

        <Section title="Account" icon="account_circle">
          <p className="text-sm">
            Signed in as <strong>{user.email}</strong> · <span className="pill">{role}</span>
          </p>
          <form
            action="/auth/signout"
            method="post"
            onSubmit={(e) => {
              const pending = loadQueue(property.id).length;
              if (pending && !confirm(`${pending} GPS mark(s) haven't uploaded yet and will be lost if you sign out. Sign out anyway?`)) {
                e.preventDefault();
                return;
              }
              clearLocalCache();
              navigator.serviceWorker?.controller?.postMessage({ type: "clear" });
            }}
          >
            <button className="btn-secondary w-full">
              <Icon name="logout" /> Sign out
            </button>
          </form>
        </Section>

        {isOwner && (
          <section className="card space-y-3 border-red-200">
            <h2 className="h-section flex items-center gap-2 text-red-800">
              <Icon name="warning" /> Danger zone
            </h2>
            <p className="text-sm">
              Clear <strong>all hunts, dog runs and GPS marks</strong> for {property.name}. Dogs, courses and covey
              counts are kept. This cannot be undone.
            </p>
            <input
              className="input"
              placeholder={`Type "${property.name}" to confirm`}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
            <button className="btn-danger w-full" disabled={confirmName !== property.name} onClick={clearHunts}>
              <Icon name="delete_forever" /> Clear all hunt data
            </button>
          </section>
        )}
      </div>
    </>
  );
}
