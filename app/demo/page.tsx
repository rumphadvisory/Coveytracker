"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import HarvestGauge from "@/components/HarvestGauge";
import Icon from "@/components/Icon";
import ScentingBadge from "@/components/ScentingBadge";
import StatBox, { RatePill } from "@/components/StatBox";
import WeatherCard from "@/components/WeatherCard";
import { formatAcres, propertyAreas } from "@/lib/areas";
import { buildDemo } from "@/lib/demoData";
import { shapesBounds } from "@/lib/geo";
import { harvestLine, UNRECOVERED_MULTIPLIER } from "@/lib/harvest";
import { formatDate } from "@/lib/seasons";
import { advisorRanking, countSummary, courseStats, dogStats, fmtPct, fmtRate, rates, totals } from "@/lib/stats";
import { pressureNote } from "@/lib/weather";
import type { GpsMarkRow } from "@/types/database";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-sand-dark" />,
});

const TABS = [
  ["field", "my_location", "Field"],
  ["map", "map", "Map"],
  ["dogs", "pets", "Dogs"],
  ["courses", "landscape", "Courses"],
  ["harvest", "speed", "Harvest"],
  ["weather", "partly_cloudy_day", "Weather"],
  ["seasons", "insights", "Seasons"],
] as const;
type Tab = (typeof TABS)[number][0];

const INTRO: Record<Tab, string> = {
  field: "What the dog man sees on the course. Pick a course, start a hunt, and tap the buttons. Each tap drops a GPS mark.",
  map: "Every covey find (orange) and dog contact (blue) this season, on satellite, hybrid or topo maps with the courses outlined.",
  dogs: "Dogs ranked by contacts this season, with hours and contacts per hour.",
  courses: "How each course is producing: coveys seen, birds, and shot-versus-seen.",
  harvest: "Fall covey counts set each course's population; the harvest is tracked against a sustainable budget.",
  weather: "Current conditions, a scenting rating, and which courses are producing the most coveys per hour.",
  seasons: "Season-over-season totals and rates.",
};

export default function DemoPage() {
  const d = useMemo(buildDemo, []);
  const [tab, setTab] = useState<Tab>("field");
  const [sessionMarks, setSessionMarks] = useState<GpsMarkRow[]>([]);

  const courseName = (id: string | null) => d.courses.find((c) => c.id === id)?.name ?? "No course";
  const dogName = (id: string | null) => d.dogs.find((x) => x.id === id)?.name ?? "—";
  const areas = useMemo(() => propertyAreas(d.property, d.courses), [d]);
  const seasonHunts = d.hunts.filter((h) => h.season === d.season);

  return (
    <div className="min-h-screen bg-sand">
      <div className="sticky top-0 z-[1001] bg-ink px-4 py-2 text-center text-xs font-semibold text-white">
        Demo with a made-up plantation. Nothing you do here is saved.{" "}
        <Link href="/#waitlist" className="ml-1 underline">
          Join the waiting list
        </Link>
      </div>
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-mark.png" alt="" width={40} height={40} className="h-10 w-10" />
          <span className="font-display text-lg">CoveyTracker</span>
        </Link>
        <span className="ml-auto truncate text-sm font-semibold text-bark">{d.property.name}</span>
      </header>

      <nav className="mx-auto max-w-5xl overflow-x-auto px-4" aria-label="Demo sections">
        <div className="flex gap-1.5 pb-2">
          {TABS.map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`chip shrink-0 ${tab === id ? "chip-on" : ""}`}
              aria-pressed={tab === id}
            >
              <Icon name={icon} className="text-[18px]" /> {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-2">
        <p className="mb-4 text-sm text-bark">{INTRO[tab]}</p>
        {tab === "field" && <FieldDemo d={d} onMark={(m) => setSessionMarks((s) => [...s, m])} marks={sessionMarks} />}
        {tab === "map" && (
          <MapView
            className="h-[60vh] min-h-[320px]"
            marks={[...d.marks, ...sessionMarks]}
            courseName={courseName}
            dogName={dogName}
            areas={areas}
            home={{ lat: d.property.lat!, lng: d.property.lng! }}
            fitKey="demo"
          />
        )}
        {tab === "dogs" && <DogsDemo d={d} />}
        {tab === "courses" && (
          <div className="grid gap-3 lg:grid-cols-2">
            {courseStats(d.courses, seasonHunts).map(({ course, totals: t, rates: r }) => (
              <section key={course.id} className="card">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="h-section">{course.name}</h2>
                  <span className="text-xs text-bark">
                    {t.hunts} hunts · {+t.hours.toFixed(1)} h · {formatAcres(course.acres ?? 0)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatBox label="Coveys seen" value={t.coveysSeen} accent="#e76624" />
                  <StatBox label="Pointed" value={t.pointed} />
                  <StatBox label="Shot" value={t.shot} />
                  <StatBox label="Contacts" value={t.contacts} accent="#257de0" />
                  <StatBox label="Total birds" value={t.totalBirds} />
                  <StatBox label="Juvenile" value={t.juvenile} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <RatePill label="Shot vs seen" value={fmtPct(r.shotVsSeen)} />
                  <RatePill label="% juvenile" value={fmtPct(r.pctJuvenile)} />
                  <RatePill label="Coveys/hr" value={fmtRate(r.coveysPerHour)} />
                </div>
              </section>
            ))}
          </div>
        )}
        {tab === "harvest" && <HarvestDemo d={d} />}
        {tab === "weather" && <WeatherDemo d={d} />}
        {tab === "seasons" && (
          <div className="grid gap-4 lg:grid-cols-2">
            {[d.season, d.lastSeason].map((s) => {
              const t = totals(d.hunts.filter((h) => h.season === s));
              const r = rates(t);
              return (
                <section key={s} className="card">
                  <div className="mb-3 flex items-baseline gap-2">
                    <h2 className="h-section">{s}</h2>
                    <span className="text-xs text-bark">
                      {t.hunts} hunts · {+t.hours.toFixed(1)} hours
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    <StatBox label="Total coveys" value={t.coveysSeen} accent="#e76624" />
                    <StatBox label="Contacts" value={t.contacts} accent="#257de0" />
                    <StatBox label="Pointed" value={t.pointed} />
                    <StatBox label="Shot" value={t.shot} />
                    <StatBox label="Total birds" value={t.totalBirds} />
                    <StatBox label="Cocks" value={t.cocks} />
                    <StatBox label="Hens" value={t.hens} />
                    <StatBox label="Juvenile" value={t.juvenile} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <RatePill label="Coveys/hr" value={fmtRate(r.coveysPerHour)} />
                    <RatePill label="Contacts/hr" value={fmtRate(r.contactsPerHour)} />
                    <RatePill label="Shot vs seen" value={fmtPct(r.shotVsSeen)} />
                    <RatePill label="% juvenile" value={fmtPct(r.pctJuvenile)} />
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <section className="card mt-8 text-center">
          <h2 className="font-display text-xl">Want this on your plantation?</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-bark">
            CoveyTracker is in private beta. Join the waiting list and we&apos;ll be in touch.
          </p>
          <Link href="/#waitlist" className="btn-primary mt-4">
            <Icon name="how_to_reg" /> Join the waiting list
          </Link>
        </section>
      </main>
    </div>
  );
}

type D = ReturnType<typeof buildDemo>;

function FieldDemo({ d, marks, onMark }: { d: D; marks: GpsMarkRow[]; onMark: (m: GpsMarkRow) => void }) {
  const [courseId, setCourseId] = useState(d.courses[0].id);
  const [active, setActive] = useState(false);
  const [picker, setPicker] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const course = d.courses.find((c) => c.id === courseId)!;
  const mine = marks.filter((m) => m.course_id === courseId);

  function drop(type: "covey" | "contact", dogId: string | null = null) {
    const b = shapesBounds(course.boundary)!;
    const lat = b.south + Math.random() * (b.north - b.south);
    const lng = b.west + Math.random() * (b.east - b.west);
    onMark({
      id: `demo-${Date.now()}-${Math.random()}`,
      property_id: d.property.id,
      hunt_id: null,
      type,
      lat,
      lng,
      accuracy: 6,
      dog_id: dogId,
      course_id: courseId,
      season: d.season,
      timestamp: new Date().toISOString(),
      notes: null,
      created_by: "demo",
    });
    navigator.vibrate?.(40);
    setFlash(type === "covey" ? "Covey marked" : `Contact: ${d.dogs.find((x) => x.id === dogId)?.name}`);
    setTimeout(() => setFlash(null), 1400);
    setPicker(false);
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="card">
          <span className="label">Select course</span>
          <p className="mb-2 flex items-center gap-1 text-sm text-forest-dark">
            <Icon name="where_to_vote" className="text-[18px]" /> On a real hunt the app picks the course you&apos;re standing in.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {d.courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setCourseId(c.id)}
                className={`min-h-[56px] rounded-xl border px-3 py-2 text-left font-semibold ${courseId === c.id ? "border-forest bg-forest text-white" : "border-line bg-white"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-primary h-16 w-full text-lg" onClick={() => setActive(true)}>
          <Icon name="play_arrow" fill /> Start hunt
        </button>
      </div>
    );
  }

  const coveys = mine.filter((m) => m.type === "covey").length;
  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="card flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg">{course.name}</div>
          <div className="text-xs text-bark">47°F Partly Cloudy · NW 5 mph · filled in automatically</div>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium text-forest">
          <Icon name="gps_fixed" className="text-[18px]" /> GPS ±6 m
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => drop("covey")} className="flex h-40 flex-col items-center justify-center gap-1 rounded-3xl bg-covey text-white shadow-lg active:scale-[0.97]">
          <Icon name="location_on" fill className="text-5xl" />
          <span className="text-lg font-bold">Mark Covey</span>
          <span className="text-sm opacity-90">{coveys} this hunt</span>
        </button>
        <button onClick={() => setPicker(true)} className="flex h-40 flex-col items-center justify-center gap-1 rounded-3xl bg-contact text-white shadow-lg active:scale-[0.97]">
          <Icon name="pets" fill className="text-5xl" />
          <span className="text-lg font-bold">Dog Contact</span>
          <span className="text-sm opacity-90">{mine.length - coveys} this hunt</span>
        </button>
      </div>
      {flash && (
        <div className="rounded-xl bg-ink px-4 py-2 text-center text-sm font-semibold text-white">
          <Icon name="check_circle" className="mr-1 text-[18px]" /> {flash}
        </div>
      )}
      {picker && (
        <div className="card">
          <span className="label">Which dog?</span>
          <div className="grid grid-cols-2 gap-2">
            {d.dogs.map((dog) => (
              <button key={dog.id} onClick={() => drop("contact", dog.id)} className="min-h-[52px] rounded-2xl border-2 border-contact/30 bg-contact/5 font-semibold text-contact">
                {dog.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="font-semibold">Marks this hunt</span>
          <span className="pill">{mine.length}</span>
        </div>
        {mine.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-bark">Tap a button to drop your first mark.</p>
        ) : (
          <ul className="max-h-60 divide-y divide-line overflow-y-auto">
            {[...mine].reverse().map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: m.type === "covey" ? "#e76624" : "#257de0" }} />
                <span className="flex-1">{m.type === "covey" ? "Covey" : `Contact · ${d.dogs.find((x) => x.id === m.dog_id)?.name}`}</span>
                <span className="text-xs text-bark">{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-center text-xs text-bark">Your marks show up on the Map tab. In the real app they save even with no signal.</p>
      <button className="btn-secondary w-full" onClick={() => setActive(false)}>
        <Icon name="flag" /> End hunt
      </button>
    </div>
  );
}

function DogsDemo({ d }: { d: D }) {
  const stats = dogStats(d.dogs, d.hunts.filter((h) => h.season === d.season));
  const max = Math.max(1, ...stats.map((s) => s.contacts));
  return (
    <ol className="space-y-2">
      {stats.map((s, i) => (
        <li key={s.dog.id} className="card">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full font-display text-lg ${i === 0 ? "bg-covey text-white" : "bg-sand-dark text-bark"}`}>{i + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold">{s.dog.name}</span>
                <span className="ml-auto font-display text-xl tabular-nums text-contact">{s.contacts}</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-sand-dark">
                <div className="h-full rounded-full bg-contact" style={{ width: `${(s.contacts / max) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {[
              [fmtRate(s.perHour), "contacts/hr"],
              [+s.hours.toFixed(1), "hours"],
              [s.hunts, "hunts"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg bg-sand py-1.5">
                <div className="font-semibold tabular-nums">{v}</div>
                <div className="text-bark">{l}</div>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function HarvestDemo({ d }: { d: D }) {
  const rate = 0.15;
  const hunts = d.hunts.filter((h) => h.season === d.season);
  const pop = countSummary(d.courses, d.counts);
  const rows = d.courses.map((c) => ({
    course: c,
    line: harvestLine(pop.find((p) => p.course.id === c.id)?.birds ?? 0, totals(hunts.filter((h) => h.course_id === c.id)).totalBirds, rate),
  }));
  const all = harvestLine(
    rows.reduce((a, r) => a + r.line.population, 0),
    rows.reduce((a, r) => a + r.line.bagged, 0),
    rate,
  );
  return (
    <>
      <section className="card mb-4">
        <h2 className="h-section mb-3">Property total · 15% harvest rate</h2>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBox label="Est. population" value={all.population} />
          <StatBox label="Budget" value={all.budget} accent="#3d6e38" />
          <StatBox label="Harvested (adj.)" value={all.harvested} sub={`${all.bagged} bagged × ${UNRECOVERED_MULTIPLIER}`} />
          <StatBox label="Remaining" value={all.remaining} accent={all.remaining < 0 ? "#b42318" : undefined} />
        </div>
        <HarvestGauge line={all} />
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map(({ course, line }) => (
          <section key={course.id} className="card">
            <div className="mb-2 flex items-baseline">
              <h3 className="font-semibold">{course.name}</h3>
              <span className="ml-auto text-xs text-bark">{line.remaining >= 0 ? `${line.remaining} birds remaining` : `${-line.remaining} over budget`}</span>
            </div>
            <HarvestGauge line={line} />
          </section>
        ))}
      </div>
    </>
  );
}

function WeatherDemo({ d }: { d: D }) {
  const note = pressureNote(d.conditions.pressure);
  const ranking = advisorRanking(d.courses, d.hunts.filter((h) => h.season === d.season));
  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="h-section">Current conditions</h2>
        <WeatherCard c={d.conditions} />
      </section>
      <section className="card">
        <h2 className="h-section mb-2">Scenting conditions</h2>
        <ScentingBadge conditions={d.conditions} detailed />
      </section>
      <section className="card">
        <h2 className="h-section mb-2 flex items-center gap-2">
          <Icon name="tips_and_updates" className="text-covey" /> Hunt Advisor
        </h2>
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-forest-light p-3 text-sm text-forest-dark">
          <Icon name="speed" />
          <div>
            <strong>{d.conditions.pressure.toFixed(2)} inHg.</strong> {note.text}
          </div>
        </div>
        <ol className="divide-y divide-line">
          {ranking.map((r, i) => (
            <li key={r.course.id} className="flex items-center gap-3 py-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-forest text-white" : "bg-sand-dark text-bark"}`}>{i + 1}</span>
              <span className="flex-1 font-medium">{r.course.name}</span>
              <span className="text-sm">
                <strong className="tabular-nums">{fmtRate(r.rates.coveysPerHour)}</strong> <span className="text-bark">coveys/hr</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-bark">Last hunt: {formatDate(d.hunts[0].date)}</p>
      </section>
    </div>
  );
}
