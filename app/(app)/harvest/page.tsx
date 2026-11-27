"use client";

import { useEffect, useMemo, useState } from "react";
import HarvestGauge from "@/components/HarvestGauge";
import Icon from "@/components/Icon";
import { useProperty } from "@/components/PropertyProvider";
import StatBox from "@/components/StatBox";
import { useHunts } from "@/components/useHunts";
import { Empty, ErrorNote, Loading, NumberField, OfflineNote, PageHeader, SeasonSelect } from "@/components/ui";
import { useCounts } from "@/components/useCounts";
import { DEFAULT_COVEY_SIZE, DEFAULT_HARVEST_RATE, harvestLine, UNRECOVERED_MULTIPLIER } from "@/lib/harvest";
import { currentSeason } from "@/lib/seasons";
import { countSummary, totals } from "@/lib/stats";

export default function HarvestPage() {
  const { property, courses } = useProperty();
  const [season, setSeason] = useState(currentSeason());
  const [rate, setRate] = useState(DEFAULT_HARVEST_RATE);
  const [avgSize, setAvgSize] = useState(DEFAULT_COVEY_SIZE);
  const { counts, error, offline } = useCounts(season);
  const { hunts, error: huntError } = useHunts(season);

  // Start from the survey's own average covey size whenever the season's counts change.
  const countsKey = counts ? `${season}:${counts.length}` : null;
  useEffect(() => {
    if (!counts) return;
    const heard = counts.reduce((a, x) => a + x.coveys_heard, 0);
    setAvgSize(heard > 0 ? Math.round(counts.reduce((a, x) => a + x.estimated_birds, 0) / heard) : DEFAULT_COVEY_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey]);

  const rows = useMemo(() => {
    if (!counts || !hunts) return [];
    const pop = countSummary(courses, counts, avgSize);
    return courses.map((course) => {
      const bagged = totals(hunts.filter((h) => h.course_id === course.id)).totalBirds;
      const population = pop.find((p) => p.course.id === course.id)?.birds ?? 0;
      return { course, line: harvestLine(population, bagged, rate) };
    });
  }, [counts, hunts, courses, avgSize, rate]);

  const property_ = useMemo(() => {
    const population = rows.reduce((a, r) => a + r.line.population, 0);
    const bagged = rows.reduce((a, r) => a + r.line.bagged, 0);
    return harvestLine(population, bagged, rate);
  }, [rows, rate]);

  const loading = counts === null || hunts === null;

  return (
    <>
      <PageHeader title="Harvest Budget" icon="speed">
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <ErrorNote error={error ?? huntError} />
      <OfflineNote show={offline} />

      <section className="card mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rate">
            Harvest rate: <span className="text-ink">{Math.round(rate * 100)}%</span>
          </label>
          <input
            id="rate"
            type="range"
            min={5}
            max={40}
            step={1}
            value={Math.round(rate * 100)}
            onChange={(e) => setRate(Number(e.target.value) / 100)}
            className="w-full accent-forest"
          />
          <div className="flex justify-between text-[11px] text-bark">
            <span>5% conservative</span>
            <span>40% aggressive</span>
          </div>
        </div>
        <NumberField label="Avg covey size" value={avgSize} onChange={(n) => setAvgSize(Math.max(1, Math.round(n)))} />
        <p className="col-span-full flex items-start gap-1 text-xs text-bark">
          <Icon name="info" className="text-[16px]" />
          Population comes from this season&apos;s fall covey counts (coveys heard × avg covey size). Bagged birds are
          multiplied by {UNRECOVERED_MULTIPLIER}× to account for crippled and unrecovered birds.
        </p>
      </section>

      {loading ? (
        <Loading />
      ) : courses.length === 0 ? (
        <Empty icon="landscape" title="No courses yet">
          Add courses in Manage, then run fall covey counts.
        </Empty>
      ) : (
        <>
          <section className="card mb-4">
            <h2 className="h-section mb-3">{property.name} — property total</h2>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatBox label="Est. population" value={property_.population} />
              <StatBox label="Budget" value={property_.budget} accent="#3d6e38" />
              <StatBox label="Harvested (adj.)" value={property_.harvested} sub={`${property_.bagged} bagged`} />
              <StatBox
                label="Remaining"
                value={property_.remaining}
                accent={property_.remaining < 0 ? "#b42318" : undefined}
              />
            </div>
            <HarvestGauge line={property_} />
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map(({ course, line }) => (
              <section key={course.id} className="card">
                <div className="mb-2 flex items-baseline">
                  <h3 className="font-semibold">{course.name}</h3>
                  <span className="ml-auto text-xs text-bark">
                    {line.remaining >= 0 ? `${line.remaining} birds remaining` : `${-line.remaining} over budget`}
                  </span>
                </div>
                <HarvestGauge line={line} />
                <div className="mt-3 grid grid-cols-4 gap-1 text-center text-xs">
                  {[
                    ["Pop.", line.population],
                    ["Budget", line.budget],
                    ["Harvested", line.harvested],
                    ["Left", line.remaining],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-sand py-1.5">
                      <div className="font-semibold tabular-nums text-ink">{v}</div>
                      <div className="text-bark">{k}</div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
