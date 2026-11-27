"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useProperty } from "@/components/PropertyProvider";
import ScentingBadge from "@/components/ScentingBadge";
import { useHunts } from "@/components/useHunts";
import WeatherCard from "@/components/WeatherCard";
import { Empty, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/data";
import { currentSeason } from "@/lib/seasons";
import { advisorRanking, fmtRate } from "@/lib/stats";
import { fetchConditions, pressureNote, type Conditions } from "@/lib/weather";

const PRESSURE_STYLE = {
  high: "bg-forest-light text-forest-dark",
  normal: "bg-sand-dark text-bark",
  low: "bg-amber-50 text-amber-800",
} as const;

export default function WeatherPage() {
  const { property, courses, canManage } = useProperty();
  const [c, setC] = useState<Conditions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const season = currentSeason();
  const { hunts } = useHunts(season);

  const refresh = useCallback(async () => {
    if (property.lat == null || property.lng == null) return;
    setLoading(true);
    setError(null);
    try {
      setC(await fetchConditions(property.lat, property.lng));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [property.lat, property.lng]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (property.lat == null || property.lng == null) {
    return (
      <Empty icon="location_off" title="Set your property location">
        Weather uses the property&apos;s center coordinates.{" "}
        {canManage && (
          <Link href="/manage" className="font-semibold text-forest underline">
            Set it in Manage
          </Link>
        )}
      </Empty>
    );
  }

  const ranking = hunts ? advisorRanking(courses, hunts) : null;
  const note = c ? pressureNote(c.pressure) : null;

  return (
    <>
      <PageHeader title="Weather" icon="partly_cloudy_day">
        <button className="btn-secondary" onClick={refresh} disabled={loading}>
          <Icon name="refresh" className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </PageHeader>
      <ErrorNote error={error} />

      {!c ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="h-section">Current conditions</h2>
              <span className="text-xs text-bark">
                Updated {new Date(c.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
            <WeatherCard c={c} />
          </section>

          <section className="card">
            <h2 className="h-section mb-2">Scenting conditions</h2>
            <ScentingBadge conditions={c} detailed />
            <p className="mt-3 text-xs text-bark">
              Ideal: 35–55°F, 60–90% humidity, wind under 8 mph, dew point 30–50°F.
            </p>
          </section>

          <section className="card">
            <h2 className="h-section mb-2 flex items-center gap-2">
              <Icon name="tips_and_updates" className="text-covey" /> Hunt Advisor
            </h2>
            {note && (
              <div className={`mb-3 flex items-start gap-2 rounded-xl p-3 text-sm ${PRESSURE_STYLE[note.level]}`}>
                <Icon name="speed" />
                <div>
                  <strong>{c.pressure.toFixed(2)} inHg.</strong> {note.text}
                </div>
              </div>
            )}
            {ranking === null ? (
              <Loading />
            ) : ranking.length === 0 ? (
              <p className="text-sm text-bark">Log a few hunts this season ({season}) to rank courses by coveys per hour.</p>
            ) : (
              <ol className="divide-y divide-line">
                {ranking.map((r, i) => (
                  <li key={r.course.id} className="flex items-center gap-3 py-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-forest text-white" : "bg-sand-dark text-bark"}`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 font-medium">{r.course.name}</span>
                    <span className="text-right text-sm">
                      <strong className="tabular-nums">{fmtRate(r.rates.coveysPerHour)}</strong>{" "}
                      <span className="text-bark">coveys/hr</span>
                      <span className="block text-xs text-bark">
                        {r.totals.hunts} hunts · {+r.totals.hours.toFixed(2)} h
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <p className="text-center text-xs text-bark">
            Weather data by{" "}
            <a href="https://open-meteo.com/" className="underline" target="_blank" rel="noreferrer">
              Open-Meteo.com
            </a>
          </p>
        </div>
      )}
    </>
  );
}
