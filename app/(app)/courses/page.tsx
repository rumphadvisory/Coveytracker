"use client";

import { useState } from "react";
import { useProperty } from "@/components/PropertyProvider";
import StatBox, { RatePill } from "@/components/StatBox";
import { useHunts } from "@/components/useHunts";
import { Empty, ErrorNote, Loading, PageHeader, SeasonSelect } from "@/components/ui";
import { currentSeason } from "@/lib/seasons";
import { courseStats, fmtPct, fmtRate } from "@/lib/stats";

export default function CoursesPage() {
  const { courses } = useProperty();
  const [season, setSeason] = useState(currentSeason());
  const { hunts, error } = useHunts(season);
  const stats = hunts ? courseStats(courses, hunts) : [];

  return (
    <>
      <PageHeader title="Course Stats" icon="landscape">
        <SeasonSelect value={season} onChange={setSeason} allowAll />
      </PageHeader>
      <ErrorNote error={error} />
      {hunts === null ? (
        <Loading />
      ) : courses.length === 0 ? (
        <Empty icon="landscape" title="No courses yet">
          Add courses in Manage.
        </Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {stats.map(({ course, totals: t, rates: r }) => (
            <section key={course.id} className="card">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="h-section">{course.name}</h2>
                <span className="text-xs text-bark">
                  {t.hunts} hunt{t.hunts === 1 ? "" : "s"} · {+t.hours.toFixed(2)} h{course.acres ? ` · ${course.acres} ac` : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label="Coveys seen" value={t.coveysSeen} accent="#e76624" />
                <StatBox label="Pointed" value={t.pointed} />
                <StatBox label="Shot" value={t.shot} />
                <StatBox label="Flushed wild" value={t.wild} />
                <StatBox label="Contacts" value={t.contacts} accent="#257de0" />
                <StatBox label="Total birds" value={t.totalBirds} />
                <StatBox label="Cocks" value={t.cocks} />
                <StatBox label="Hens" value={t.hens} />
                <StatBox label="Juvenile" value={t.juvenile} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <RatePill label="Shot vs seen" value={fmtPct(r.shotVsSeen)} />
                <RatePill label="Pointed vs seen" value={fmtPct(r.pointedVsSeen)} />
                <RatePill label="% juvenile" value={fmtPct(r.pctJuvenile)} />
                <RatePill label="Coveys/hr" value={fmtRate(r.coveysPerHour)} />
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
