"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { useProperty } from "@/components/PropertyProvider";
import StatBox from "@/components/StatBox";
import { CourseSelect, ErrorNote, Loading, NumberField, OfflineNote, PageHeader, SeasonSelect } from "@/components/ui";
import { useCounts } from "@/components/useCounts";
import { errorMessage, type Pending } from "@/lib/data";
import { enqueue, insertOp, removeQueuedRow, SYNCED_EVENT } from "@/lib/outbox";
import { formatCoord, getPosition } from "@/lib/gps";
import { DEFAULT_COVEY_SIZE } from "@/lib/harvest";
import { currentSeason, formatDate, seasonForDate, todayISO } from "@/lib/seasons";
import { countSummary } from "@/lib/stats";
import type { CoveyCountRow } from "@/types/database";

const blank = () => ({
  date: todayISO(),
  course_id: "",
  coveys_heard: 0,
  avg_covey_size: DEFAULT_COVEY_SIZE,
  acres_surveyed: 0,
  notes: "",
  lat: null as number | null,
  lng: null as number | null,
  accuracy: null as number | null,
});

export default function CountsPage() {
  const { sb, property, courses, courseName, canManage } = useProperty();
  const [season, setSeason] = useState(currentSeason());
  const { counts, error: loadError, offline } = useCounts(season);
  const [form, setForm] = useState(blank);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stamp() {
    setGpsBusy(true);
    try {
      const f = await getPosition();
      setForm((x) => ({ ...x, lat: f.lat, lng: f.lng, accuracy: f.accuracy }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGpsBusy(false);
    }
  }

  // GPS-stamp the listening point as soon as the page opens.
  useEffect(() => {
    stamp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { lat, lng, date, course_id, coveys_heard, avg_covey_size, acres_surveyed, notes } = form;
    // Saved on the phone first, uploaded by QueueSync — works with no signal.
    enqueue(
      property.id,
      insertOp(property.id, "covey_counts", {
        id: crypto.randomUUID(),
        lat,
        lng,
        date,
        coveys_heard,
        avg_covey_size,
        notes: notes || null,
        course_id: course_id || null,
        acres_surveyed: acres_surveyed || null,
        property_id: property.id,
        season: seasonForDate(date),
      }),
    );
    setSaving(false);
    setForm((x) => ({ ...blank(), date: x.date, course_id: x.course_id, avg_covey_size: x.avg_covey_size }));
    stamp();
  }

  async function remove(c: Pending<CoveyCountRow>) {
    if (!confirm("Delete this listening point?")) return;
    if (c._pending) {
      removeQueuedRow(property.id, c.id);
      return;
    }
    const { error } = await sb.from("covey_counts").delete().eq("id", c.id);
    if (error) return setError(error.message);
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT)); // refetch
  }

  const summary = counts ? countSummary(courses, counts).filter((r) => r.surveys > 0) : [];
  const totalCoveys = summary.reduce((a, r) => a + r.coveys, 0);
  const totalBirds = summary.reduce((a, r) => a + r.birds, 0);

  return (
    <>
      <PageHeader title="Covey Counts" icon="hearing">
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <ErrorNote error={error ?? loadError} />
      <OfflineNote show={offline} />

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={save} className="card space-y-3">
          <h2 className="h-section">New listening point</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="cdate">
                Date
              </label>
              <input id="cdate" type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="ccourse">
                Course
              </label>
              <CourseSelect id="ccourse" value={form.course_id} onChange={(v) => setForm({ ...form, course_id: v })} required />
            </div>
            <NumberField label="Coveys heard" value={form.coveys_heard} onChange={(n) => setForm({ ...form, coveys_heard: Math.round(n) })} />
            <NumberField label="Avg covey size" value={form.avg_covey_size} onChange={(n) => setForm({ ...form, avg_covey_size: Math.max(1, Math.round(n)) })} />
            <NumberField label="Acres surveyed" value={form.acres_surveyed} step={10} onChange={(n) => setForm({ ...form, acres_surveyed: n })} />
            <div>
              <span className="label">Listening point</span>
              <button type="button" className="btn-secondary w-full text-xs" onClick={stamp} disabled={gpsBusy}>
                <Icon name={gpsBusy ? "progress_activity" : form.lat != null ? "gps_fixed" : "gps_not_fixed"} className={gpsBusy ? "animate-spin" : ""} />
                {form.lat != null && form.lng != null ? `${formatCoord(form.lat, form.lng)}` : gpsBusy ? "Locating…" : "Get GPS"}
              </button>
              {form.accuracy != null && <div className="mt-1 text-xs text-bark">±{Math.round(form.accuracy)} m</div>}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="cnotes">
              Notes
            </label>
            <textarea id="cnotes" rows={2} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-forest-light px-4 py-3">
            <div>
              <div className="font-semibold text-forest-dark">Estimated birds</div>
              <div className="text-xs text-forest-dark/70">Auto: coveys heard × avg covey size</div>
            </div>
            <div className="font-display text-3xl tabular-nums text-forest-dark">{form.coveys_heard * form.avg_covey_size}</div>
          </div>
          <button className="btn-primary w-full" disabled={saving || !form.course_id}>
            <Icon name="save" /> {saving ? "Saving…" : "Save count"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatBox label={`Coveys heard · ${season}`} value={totalCoveys} accent="#e76624" />
            <StatBox label="Estimated birds" value={totalBirds} />
          </div>
          {counts === null ? (
            <Loading />
          ) : (
            <>
              {summary.length > 0 && (
                <div className="card p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs uppercase text-bark">
                        <th className="px-3 py-2 text-left">Course</th>
                        <th className="table-cell">Points</th>
                        <th className="table-cell">Coveys</th>
                        <th className="table-cell pr-3">Birds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((r) => (
                        <tr key={r.course.id} className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-2">{r.course.name}</td>
                          <td className="table-cell">{r.surveys}</td>
                          <td className="table-cell">{r.coveys}</td>
                          <td className="table-cell pr-3 font-semibold">{r.birds}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <ul className="space-y-2">
                {counts.map((c) => (
                  <li key={c.id} className="card flex items-start gap-3 py-3 text-sm">
                    <Icon name="hearing" className="text-covey" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        {formatDate(c.date)} · {courseName(c.course_id)}
                      </div>
                      <div className="text-bark">
                        {c.coveys_heard} coveys × {c.avg_covey_size} = <strong className="text-ink">{c.estimated_birds} birds</strong>
                        {c.acres_surveyed ? ` · ${c.acres_surveyed} ac` : ""}
                      </div>
                      {c.lat != null && c.lng != null && <div className="text-xs text-bark">{formatCoord(c.lat, c.lng)}</div>}
                      {c.notes && <div className="mt-1 text-xs">{c.notes}</div>}
                      {c._pending && (
                        <span className="pill mt-1 bg-amber-100 text-amber-900">
                          <Icon name="cloud_off" className="text-[14px]" /> Waiting to upload
                        </span>
                      )}
                    </div>
                    {(canManage || c._pending) && (
                      <button className="p-1 text-bark" onClick={() => remove(c)} aria-label="Delete count">
                        <Icon name="delete" className="text-[20px]" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
