"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useProperty } from "@/components/PropertyProvider";
import { CourseSelect, Empty, ErrorNote, Loading, OfflineNote, PageHeader, SeasonSelect } from "@/components/ui";
import { useHunts } from "@/components/useHunts";
import { ALL, type Pending } from "@/lib/data";
import { removeQueuedHunt } from "@/lib/outbox";
import { currentSeason, formatDate } from "@/lib/seasons";
import type { HuntWithRuns } from "@/types/database";

export default function HuntsPage() {
  const { sb, property, courseName, dogName, canManage } = useProperty();
  const [season, setSeason] = useState(currentSeason());
  const [course, setCourse] = useState(ALL);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { hunts, error: loadError, offline, reload } = useHunts(season);

  async function remove(h: Pending<HuntWithRuns>) {
    if (!confirm(`Delete the ${formatDate(h.date)} hunt on ${courseName(h.course_id)}? This can't be undone.`)) return;
    // Not uploaded yet: just drop it (and its dog runs) from this phone.
    if (h._pending) {
      removeQueuedHunt(property.id, h.id);
      return;
    }
    const { error } = await sb.from("hunts").delete().eq("id", h.id);
    if (error) return setError(error.message);
    reload();
  }

  const shown = (hunts ?? []).filter((h) => course === ALL || h.course_id === course);

  return (
    <>
      <PageHeader title="Hunts" icon="list_alt">
        <SeasonSelect value={season} onChange={setSeason} allowAll />
        <CourseSelect value={course} onChange={setCourse} allowAll className="w-auto py-2 text-sm" />
        <Link href="/log" className="btn-primary min-h-0 px-3 py-2 text-sm">
          <Icon name="add" className="text-[18px]" /> Log hunt
        </Link>
      </PageHeader>
      <ErrorNote error={error ?? loadError} />
      <OfflineNote show={offline} />

      {hunts === null ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty icon="list_alt" title="No hunts yet">
          <Link href="/field" className="font-semibold text-forest underline">
            Start one in Field Mode
          </Link>{" "}
          or{" "}
          <Link href="/log" className="font-semibold text-forest underline">
            log one manually
          </Link>
          .
        </Empty>
      ) : (
        <ul className="space-y-2">
          {shown.map((h) => {
            const isOpen = open === h.id;
            return (
              <li key={h.id} className="card p-0">
                <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : h.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {formatDate(h.date)} · {courseName(h.course_id)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {h._pending && (
                        <span className="pill bg-amber-100 text-amber-900">
                          <Icon name="cloud_off" className="text-[14px]" /> Waiting to upload
                        </span>
                      )}
                      <span className="pill">{h.total_coveys_seen} coveys</span>
                      <span className="pill">{h.total_contacts} contacts</span>
                      <span className="pill">{h.total_birds_adult + h.total_birds_juvenile} birds</span>
                      {h.hours_spent != null && <span className="pill">{h.hours_spent} h</span>}
                    </div>
                    {h.dog_runs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {h.dog_runs.map((r) => (
                          <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-contact/10 px-2 py-0.5 text-xs font-medium text-contact">
                            <Icon name="pets" className="text-[14px]" />
                            {dogName(r.dog_id)} · {r.contacts}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Icon name={isOpen ? "expand_less" : "expand_more"} className="text-bark" />
                </button>
                {isOpen && (
                  <div className="border-t border-line p-4">
                    <Link href={`/hunt?id=${h.id}`} className="btn-primary mb-4 w-full">
                      <Icon name="map" /> Open hunt: map, dog tracks &amp; timeline
                    </Link>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                      {(
                        [
                          ["Season", h.season],
                          ["Weather", h.weather],
                          ["Temperature", h.temperature],
                          ["Wind", h.wind],
                          ["Barometer", h.barometric_pressure],
                          ["Ground", h.ground],
                          ["Pointed", h.coveys_pointed],
                          ["Shot", h.coveys_shot],
                          ["Flushed", h.coveys_flushed],
                          ["Flushed wild", h.coveys_flushed_wild],
                          ["Coveys seen", h.total_coveys_seen],
                          ["Birds on rise", h.birds_on_covey_rise],
                          ["Singles shot", h.singles_shot],
                          ["Cocks", h.total_birds_cocks],
                          ["Hens", h.total_birds_hens],
                          ["Adult", h.total_birds_adult],
                          ["Juvenile", h.total_birds_juvenile],
                          ["Contacts", h.total_contacts],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-bark">{k}</dt>
                          <dd className="font-medium">{v === null || v === "" ? "—" : v}</dd>
                        </div>
                      ))}
                    </dl>
                    {h.dog_runs.length > 0 && (
                      <table className="mt-4 w-full text-sm">
                        <thead>
                          <tr className="border-b border-line text-xs uppercase text-bark">
                            <th className="py-1 text-left">Dog</th>
                            <th className="table-cell">Contacts</th>
                            <th className="table-cell">Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {h.dog_runs.map((r) => (
                            <tr key={r.id} className="border-b border-line/60">
                              <td className="py-1">{dogName(r.dog_id)}</td>
                              <td className="table-cell">{r.contacts}</td>
                              <td className="table-cell">{r.hours ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {h.comments && <p className="mt-3 whitespace-pre-wrap text-sm text-bark">{h.comments}</p>}
                    {(canManage || h._pending) && (
                      <div className="mt-4 flex justify-end">
                        <button className="btn-ghost text-red-700" onClick={() => remove(h)}>
                          <Icon name="delete" /> Delete hunt
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
