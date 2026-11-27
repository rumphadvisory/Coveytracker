"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { useProperty } from "@/components/PropertyProvider";
import { useHunts } from "@/components/useHunts";
import { Empty, ErrorNote, Loading, PageHeader, SeasonSelect } from "@/components/ui";
import { currentSeason } from "@/lib/seasons";
import { dogStats, fmtRate } from "@/lib/stats";

export default function DogsPage() {
  const { dogs } = useProperty();
  const [season, setSeason] = useState(currentSeason());
  const { hunts, error } = useHunts(season);

  const stats = hunts ? dogStats(dogs, hunts) : [];
  const max = Math.max(1, ...stats.map((s) => s.contacts));

  return (
    <>
      <PageHeader title="Dog Performance" icon="pets">
        <SeasonSelect value={season} onChange={setSeason} allowAll />
      </PageHeader>
      <ErrorNote error={error} />
      {hunts === null ? (
        <Loading />
      ) : stats.length === 0 ? (
        <Empty icon="pets" title="No dog data yet">
          Add dogs in Manage, then record contacts in Field Mode or the hunt logger.
        </Empty>
      ) : (
        <ol className="space-y-2">
          {stats.map((s, i) => (
            <li key={s.dog.id} className="card">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg ${
                    i === 0 && s.contacts > 0 ? "bg-covey text-white" : "bg-sand-dark text-bark"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{s.dog.name}</span>
                    {!s.dog.active && <span className="pill">retired</span>}
                    <span className="ml-auto font-display text-xl tabular-nums text-contact">{s.contacts}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-sand-dark">
                    <div className="h-full rounded-full bg-contact" style={{ width: `${(s.contacts / max) * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-sand py-1.5">
                  <div className="font-semibold tabular-nums text-ink">{fmtRate(s.perHour)}</div>
                  <div className="text-bark">contacts/hr</div>
                </div>
                <div className="rounded-lg bg-sand py-1.5">
                  <div className="font-semibold tabular-nums text-ink">{+s.hours.toFixed(2)}</div>
                  <div className="text-bark">hours</div>
                </div>
                <div className="rounded-lg bg-sand py-1.5">
                  <div className="font-semibold tabular-nums text-ink">{s.hunts}</div>
                  <div className="text-bark">hunts</div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 flex items-center gap-1 text-xs text-bark">
        <Icon name="info" className="text-[16px]" /> Ranked by total contacts for the selected season.
      </p>
    </>
  );
}
