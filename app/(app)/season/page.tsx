"use client";

import { useMemo } from "react";
import StatBox, { RatePill } from "@/components/StatBox";
import { useHunts } from "@/components/useHunts";
import { Empty, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { ALL } from "@/lib/data";
import { fmtPct, fmtRate, rates, totals } from "@/lib/stats";

export default function SeasonPage() {
  const { hunts, error } = useHunts(ALL);

  const bySeason = useMemo(() => {
    const map = new Map<string, NonNullable<typeof hunts>>();
    for (const h of hunts ?? []) map.set(h.season, [...(map.get(h.season) ?? []), h]);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [hunts]);

  return (
    <>
      <PageHeader title="Season Dashboard" icon="insights" />
      <ErrorNote error={error} />
      {hunts === null ? (
        <Loading />
      ) : bySeason.length === 0 ? (
        <Empty icon="insights" title="No seasons logged yet">
          Season cards appear once you log hunts.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {bySeason.map(([season, list]) => {
            const t = totals(list);
            const r = rates(t);
            return (
              <section key={season} className="card">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="h-section">{season}</h2>
                  <span className="text-xs text-bark">
                    {t.hunts} hunts · {+t.hours.toFixed(2)} hours
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  <StatBox label="Pointed" value={t.pointed} />
                  <StatBox label="Shot" value={t.shot} />
                  <StatBox label="Flushed" value={t.flushed} />
                  <StatBox label="Wild" value={t.wild} />
                  <StatBox label="Total coveys" value={t.coveysSeen} accent="#e76624" />
                  <StatBox label="Contacts" value={t.contacts} accent="#257de0" />
                  <StatBox label="Birds on rise" value={t.birdsOnRise} />
                  <StatBox label="Singles" value={t.singles} />
                  <StatBox label="Total birds" value={t.totalBirds} />
                  <StatBox label="Cocks" value={t.cocks} />
                  <StatBox label="Hens" value={t.hens} />
                  <StatBox label="Juvenile" value={t.juvenile} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <RatePill label="Coveys/hr" value={fmtRate(r.coveysPerHour)} />
                  <RatePill label="Contacts/hr" value={fmtRate(r.contactsPerHour)} />
                  <RatePill label="Birds/hr" value={fmtRate(r.birdsPerHour)} />
                  <RatePill label="Shot vs seen" value={fmtPct(r.shotVsSeen)} />
                  <RatePill label="Pointed vs seen" value={fmtPct(r.pointedVsSeen)} />
                  <RatePill label="% juvenile" value={fmtPct(r.pctJuvenile)} />
                  <RatePill label="% adult" value={fmtPct(r.pctAdult)} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
