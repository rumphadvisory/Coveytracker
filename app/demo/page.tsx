"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
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
import { seasonInsights, type Insight, type InsightTopic } from "@/lib/insights";
import { buildReport, change, formatKpi, formatWindow } from "@/lib/report";
import { NOTE_CATEGORIES, isNoteCategory, scoutTitle, scoutingPlan } from "@/lib/scouting";
import type { ExtraPoint } from "@/components/MapView";
import type { GpsMarkRow } from "@/types/database";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-sand-dark" />,
});

type StepId = "field" | "map" | "scout" | "dogs" | "courses" | "harvest" | "weather" | "seasons" | "report" | "insights";

interface Step {
  id: StepId;
  icon: string;
  label: string;
  title: string;
  lead: string;
  notice: string[];
  /** Which computed insights belong under "Use it to decide" on this step. */
  topics: InsightTopic[];
  /** A decision that isn't a computed insight (map and weather steps). */
  decide?: string;
}

const STEPS: Step[] = [
  {
    id: "field",
    icon: "my_location",
    label: "Field",
    title: "Mark coveys as you hunt",
    lead: "This is what the dog man sees on the course: two big buttons, used one-handed. Every tap is GPS-stamped and works with no signal.",
    notice: ["The app picks the course you're standing in.", "Weather fills in automatically when the hunt starts."],
    topics: [],
  },
  {
    id: "map",
    icon: "map",
    label: "Map",
    title: "See where the birds are",
    lead: "Every covey find (orange) and dog contact (blue) this season, on the courses you outlined.",
    notice: ["Where coveys cluster, and which parts of a course are empty.", "Switch Satellite, Hybrid and Topo at the top right."],
    topics: [],
    decide: "Plan burns, food plots and feeding around where coveys are (and aren't), and start hunts where birds concentrate.",
  },
  {
    id: "scout",
    icon: "explore",
    label: "Scout",
    title: "Scout new ground and plan it",
    lead: "Magnolia Bend just added the Cypress Tract: no courses, no dogs yet. Walk it, tap where you find coveys and what the habitat needs, and the app builds a development plan.",
    notice: ["Covey groups become hotspots: that's where courses go.", "Habitat notes (burns, brush, predators, food) turn into a work list."],
    topics: [],
    decide: "Lay out courses through the hotspots, schedule the burns and predator control first, and re-scout next fall to see if the work paid off.",
  },
  {
    id: "dogs",
    icon: "pets",
    label: "Dogs",
    title: "Know which dogs are finding birds",
    lead: "Each dog ranked by contacts this season, with hours and contacts per hour so long days don't skew the picture.",
    notice: ["Contacts per hour is the fair comparison.", "Garmin tracks add miles and time moving on each hunt."],
    topics: ["dogs"],
  },
  {
    id: "courses",
    icon: "landscape",
    label: "Courses",
    title: "See which courses produce",
    lead: "Coveys, points, shooting and birds for every course, so you can compare ground fairly.",
    notice: ["Coveys per hour shows which ground is producing.", "Shot vs seen and wild flushes show how hunts are going."],
    topics: ["course", "quality"],
  },
  {
    id: "harvest",
    icon: "speed",
    label: "Harvest",
    title: "Harvest sustainably",
    lead: "Fall covey counts set each course's population. The bag (×1.3 for unrecovered birds) is tracked against a sustainable budget.",
    notice: ["Green is light pressure, yellow is close to budget, red is over.", "The harvest rate is adjustable in the app."],
    topics: ["harvest"],
  },
  {
    id: "weather",
    icon: "partly_cloudy_day",
    label: "Weather",
    title: "Pick the day and the course",
    lead: "Current conditions, a scenting rating for the dogs, and which courses are producing the most coveys per hour.",
    notice: ["Scenting is rated from temperature, humidity, wind and dew point.", "High, rising pressure tends to mean more coveys per hour."],
    topics: [],
    decide: "On a good scenting day, run your best dogs on your most productive course. On a poor one, shorten hunts or save your best ground.",
  },
  {
    id: "seasons",
    icon: "insights",
    label: "Seasons",
    title: "Track the trend year over year",
    lead: "Season totals and rates side by side, so you can see whether management is working.",
    notice: ["Coveys per hour is a population index from your own hunts.", "Juveniles per adult reflects how the nesting season went."],
    topics: ["trend", "reproduction"],
  },
  {
    id: "report",
    icon: "summarize",
    label: "Reports",
    title: "Report to the owners",
    lead: "A weekly, monthly or season report, compared with the same dates last year, with an outlook and recommendations. Save it as a PDF, paste it in an email, or export the year-over-year table for slides.",
    notice: [
      "Everything belongs to the property, not the person: when a manager moves on, the next one picks up the full history.",
      "The year-over-year table is the backbone of a long-term management plan.",
    ],
    topics: [],
  },
  {
    id: "insights",
    icon: "lightbulb",
    label: "Takeaways",
    title: "What your season is telling you",
    lead: "Everything above adds up to decisions: where to hunt, where to ease off, and what to change before next season.",
    notice: [],
    topics: ["course", "harvest", "trend", "reproduction", "dogs", "quality"],
  },
];

const TONE: Record<Insight["tone"], string> = {
  good: "border-forest/30 bg-forest-light/60",
  watch: "border-amber-300 bg-amber-50",
  neutral: "border-line bg-sand",
};

function InsightCard({ i }: { i: Insight }) {
  return (
    <div className={`rounded-2xl border p-4 ${TONE[i.tone]}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon name={i.icon} className={i.tone === "watch" ? "text-amber-700" : "text-forest"} />
        {i.title}
        {i.tone === "watch" && <span className="pill ml-auto bg-amber-200 text-amber-900">Watch</span>}
      </div>
      <p className="mt-2 text-sm text-ink">{i.finding}</p>
      <p className="mt-2 flex gap-1.5 text-sm text-bark">
        <Icon name="arrow_forward" className="mt-0.5 text-[16px] text-forest" />
        <span>{i.action}</span>
      </p>
    </div>
  );
}

export default function DemoPage() {
  const d = useMemo(buildDemo, []);
  const [step, setStep] = useState(-1); // -1 = intro
  const [sessionMarks, setSessionMarks] = useState<GpsMarkRow[]>([]);
  const [fieldDone, setFieldDone] = useState(false);

  const courseName = (id: string | null) => d.courses.find((c) => c.id === id)?.name ?? "No course";
  const dogName = (id: string | null) => d.dogs.find((x) => x.id === id)?.name ?? "—";
  const areas = useMemo(() => propertyAreas(d.property, d.courses), [d]);
  const seasonHunts = d.hunts.filter((h) => h.season === d.season);
  const insights = useMemo(
    () =>
      seasonInsights({
        hunts: d.hunts.filter((h) => h.season === d.season),
        lastSeasonHunts: d.hunts.filter((h) => h.season === d.lastSeason),
        courses: d.courses,
        dogs: d.dogs,
        counts: d.counts,
      }),
    [d],
  );

  const go = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cur = step >= 0 ? STEPS[step] : null;
  const last = step === STEPS.length - 1;
  const myCourse = sessionMarks.length ? courseName(sessionMarks[sessionMarks.length - 1].course_id) : null;

  return (
    <div className="min-h-screen bg-sand">
      <div className="sticky top-0 z-[1001] bg-ink px-4 py-2 text-center text-xs font-semibold text-white">
        Demo with a made-up plantation. Nothing you do here is saved.
      </div>
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-mark.png" alt="" width={40} height={40} className="h-10 w-10" />
          <span className="font-display text-lg">CoveyTracker</span>
        </Link>
        <span className="ml-auto truncate text-sm font-semibold text-bark">{d.property.name}</span>
      </header>

      {step === -1 ? (
        <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
          <h1 className="text-center font-display text-3xl text-ink">See CoveyTracker in 3 minutes</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-bark">
            A guided tour of a sample plantation, from marking a covey in the field to the season decisions it adds up to.
          </p>
          <ol className="mt-6 space-y-2">
            {STEPS.map((st, n) => (
              <li key={st.id}>
                <button onClick={() => go(n)} className="card flex w-full items-center gap-3 py-3 text-left hover:border-forest">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-light font-semibold text-forest-dark">
                    {n + 1}
                  </span>
                  <Icon name={st.icon} className="text-forest" />
                  <span className="flex-1 font-semibold">{st.title}</span>
                  <Icon name="chevron_right" className="text-bark" />
                </button>
              </li>
            ))}
          </ol>
          <button className="btn-primary mt-6 h-14 w-full text-base" onClick={() => go(0)}>
            <Icon name="play_arrow" fill /> Start the tour
          </button>
          <p className="mt-2 text-center text-xs text-bark">Or tap any step to jump straight to it.</p>
        </main>
      ) : (
        <>
          <nav className="mx-auto max-w-5xl overflow-x-auto px-4" aria-label="Jump to a step">
            <div className="flex gap-1.5 pb-2">
              {STEPS.map((st, n) => (
                <button
                  key={st.id}
                  onClick={() => go(n)}
                  className={`chip shrink-0 min-h-[34px] px-3 py-1 text-xs ${n === step ? "chip-on" : ""}`}
                  aria-current={n === step ? "step" : undefined}
                >
                  <Icon name={st.icon} className="text-[16px]" /> {st.label}
                </button>
              ))}
            </div>
          </nav>

          <main className="mx-auto max-w-5xl px-4 pb-32 pt-2">
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-forest">
                Step {step + 1} of {STEPS.length}
              </div>
              <h1 className="mt-1 font-display text-2xl text-ink sm:text-3xl">{cur!.title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-bark sm:text-base">{cur!.lead}</p>
              {cur!.notice.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-sm text-ink sm:flex-row sm:flex-wrap sm:gap-x-5">
                  {cur!.notice.map((n) => (
                    <li key={n} className="flex items-start gap-1.5">
                      <Icon name="visibility" className="mt-0.5 text-[16px] text-forest" /> {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cur!.id === "field" && (
              <FieldDemo
                d={d}
                marks={sessionMarks}
                onMark={(m) => setSessionMarks((x) => [...x, m])}
                onDone={() => setFieldDone(true)}
              />
            )}
            {cur!.id === "map" && (
              <>
                {myCourse && (
                  <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-forest-light p-3 text-sm text-forest-dark">
                    <Icon name="where_to_vote" /> Your {sessionMarks.length} mark{sessionMarks.length === 1 ? "" : "s"} from the
                    field are on {myCourse}, alongside the season&apos;s finds.
                  </p>
                )}
                <MapView
                  className="h-[55vh] min-h-[320px]"
                  marks={[...d.marks, ...sessionMarks]}
                  courseName={courseName}
                  dogName={dogName}
                  areas={areas}
                  home={{ lat: d.property.lat!, lng: d.property.lng! }}
                  fitKey="demo"
                />
              </>
            )}
            {cur!.id === "scout" && <ScoutDemo d={d} courseName={courseName} dogName={dogName} />}
            {cur!.id === "dogs" && <DogsDemo d={d} />}
            {cur!.id === "courses" && (
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
                      <RatePill label="Coveys/hr" value={fmtRate(r.coveysPerHour)} />
                      <RatePill label="Shot vs seen" value={fmtPct(r.shotVsSeen)} />
                      <RatePill label="% juvenile" value={fmtPct(r.pctJuvenile)} />
                    </div>
                  </section>
                ))}
              </div>
            )}
            {cur!.id === "harvest" && <HarvestDemo d={d} />}
            {cur!.id === "weather" && <WeatherDemo d={d} />}
            {cur!.id === "seasons" && (
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
                        <StatBox label="Shot" value={t.shot} />
                        <StatBox label="Total birds" value={t.totalBirds} />
                        <StatBox label="Adults" value={t.adult} />
                        <StatBox label="Juvenile" value={t.juvenile} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <RatePill label="Coveys/hr" value={fmtRate(r.coveysPerHour)} />
                        <RatePill label="Contacts/hr" value={fmtRate(r.contactsPerHour)} />
                        <RatePill label="Juv. per adult" value={t.adult ? (t.juvenile / t.adult).toFixed(2) : "—"} />
                        <RatePill label="Shot vs seen" value={fmtPct(r.shotVsSeen)} />
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {cur!.id === "report" && <ReportDemo d={d} />}

            {(cur!.topics.length > 0 || cur!.decide) && (
              <section className="mt-6">
                <h2 className="mb-2 flex items-center gap-2 font-display text-lg text-ink">
                  <Icon name="lightbulb" className="text-covey" />
                  {cur!.id === "insights" ? "This season at Magnolia Bend" : "Use it to decide"}
                </h2>
                <div className={`grid gap-3 ${cur!.id === "insights" ? "md:grid-cols-2" : ""}`}>
                  {cur!.decide && (
                    <div className="rounded-2xl border border-line bg-white p-4 text-sm text-ink">
                      <span className="flex gap-1.5">
                        <Icon name="arrow_forward" className="mt-0.5 text-[16px] text-forest" /> {cur!.decide}
                      </span>
                    </div>
                  )}
                  {insights
                    .filter((i) => cur!.topics.includes(i.topic))
                    .map((i) => (
                      <InsightCard key={i.topic} i={i} />
                    ))}
                </div>
              </section>
            )}

            {last && (
              <section className="card mt-8 text-center">
                <h2 className="font-display text-xl">Want this for your plantation?</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-bark">
                  CoveyTracker turns every hunt into the records behind these decisions. It&apos;s in private beta; join the
                  waiting list and we&apos;ll be in touch.
                </p>
                <Link href="/#waitlist" className="btn-primary mt-4">
                  <Icon name="how_to_reg" /> Join the waiting list
                </Link>
              </section>
            )}
          </main>

          {/* Tour controls, always in reach. */}
          <div className="fixed inset-x-0 bottom-0 z-[1001] border-t border-line bg-white/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            <div className="mx-auto flex max-w-2xl items-center gap-3">
              <button className="btn-secondary" onClick={() => go(step - 1)} aria-label={step === 0 ? "Back to the tour overview" : "Previous step"}>
                <Icon name="arrow_back" /> <span className="hidden sm:inline">Back</span>
              </button>
              <div className="flex flex-1 justify-center gap-1.5" aria-hidden>
                {STEPS.map((st, n) => (
                  <span key={st.id} className={`h-2 rounded-full transition-all ${n === step ? "w-6 bg-forest" : n < step ? "w-2 bg-forest/50" : "w-2 bg-line"}`} />
                ))}
              </div>
              {last ? (
                <Link href="/#waitlist" className="btn-primary">
                  <Icon name="how_to_reg" /> Join waitlist
                </Link>
              ) : (
                <button
                  className={`btn-primary ${cur!.id === "field" && fieldDone ? "ring-4 ring-amber-300 animate-pulse" : ""}`}
                  onClick={() => go(step + 1)}
                >
                  Next <Icon name="arrow_forward" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type D = ReturnType<typeof buildDemo>;

const PULSE = "ring-4 ring-amber-300 animate-pulse";

/** Coaching bubble for the Field step. */
function Coach({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-medium text-ink" role="status">
      <Icon name="touch_app" className="text-amber-700" />
      <span>{children}</span>
    </div>
  );
}

function FieldDemo({ d, marks, onMark, onDone }: { d: D; marks: GpsMarkRow[]; onMark: (m: GpsMarkRow) => void; onDone: () => void }) {
  const [courseId, setCourseId] = useState(d.courses[0].id);
  const [active, setActive] = useState(false);
  const [picker, setPicker] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const course = d.courses.find((c) => c.id === courseId)!;
  const told = useRef(false);
  const onDoneOnce = () => {
    if (told.current) return;
    told.current = true;
    setTimeout(onDone, 0); // after render
  };
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
        <Coach>Pick a course, then tap <strong>Start hunt</strong>.</Coach>
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
        <button className={`btn-primary h-16 w-full text-lg ${PULSE}`} onClick={() => setActive(true)}>
          <Icon name="play_arrow" fill /> Start hunt
        </button>
      </div>
    );
  }

  const coveys = mine.filter((m) => m.type === "covey").length;
  const contacts = mine.length - coveys;
  const stage = coveys === 0 ? "covey" : contacts === 0 ? "contact" : "done";
  if (stage === "done") onDoneOnce();
  return (
    <div className="mx-auto max-w-md space-y-3">
      <Coach>
        {stage === "covey" && (
          <>
            The dogs pointed a covey. Tap <strong>Mark Covey</strong>; it records the exact spot and time.
          </>
        )}
        {stage === "contact" && (
          <>
            Now a dog found birds: tap <strong>Dog Contact</strong> and choose the dog.
          </>
        )}
        {stage === "done" && (
          <>
            That&apos;s all there is to it in the field. Tap <strong>Next</strong> to see your marks on the map.
          </>
        )}
      </Coach>
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
        <button onClick={() => drop("covey")} className={`flex h-40 flex-col items-center justify-center gap-1 rounded-3xl bg-covey text-white shadow-lg active:scale-[0.97] ${stage === "covey" ? PULSE : ""}`}>
          <Icon name="location_on" fill className="text-5xl" />
          <span className="text-lg font-bold">Mark Covey</span>
          <span className="text-sm opacity-90">{coveys} this hunt</span>
        </button>
        <button onClick={() => setPicker(true)} className={`flex h-40 flex-col items-center justify-center gap-1 rounded-3xl bg-contact text-white shadow-lg active:scale-[0.97] ${stage === "contact" && !picker ? PULSE : ""}`}>
          <Icon name="pets" fill className="text-5xl" />
          <span className="text-lg font-bold">Dog Contact</span>
          <span className="text-sm opacity-90">{contacts} this hunt</span>
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

function ScoutDemo({ d, courseName, dogName }: { d: D; courseName: (id: string | null) => string; dogName: (id: string | null) => string }) {
  const center = useMemo(() => {
    const b = shapesBounds([d.tract])!;
    return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
  }, [d]);
  const plan = useMemo(
    () => scoutingPlan({ coveys: d.scoutCoveys, notes: d.scoutNotes, boundary: [d.tract], center, courses: [] }),
    [d, center],
  );
  const notePoints: ExtraPoint[] = d.scoutNotes.map((n) => ({
    id: n.id,
    lat: n.lat,
    lng: n.lng,
    title: scoutTitle(n),
    lines: n.notes ? [n.notes] : [],
    color: NOTE_CATEGORIES[isNoteCategory(n.category) ? n.category : "other"].color,
  }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <MapView
          className="h-[48vh] min-h-[300px]"
          marks={d.scoutCoveys}
          extraPoints={notePoints}
          courseName={courseName}
          dogName={dogName}
          areas={[{ id: "tract", label: "Cypress Tract", color: "#ffffff", shapes: [d.tract], kind: "property" }]}
          home={center}
          showLegend={false}
          fitKey="demo-scout"
        />
        <p className="mt-2 text-xs text-bark">Orange: coveys found. Other colors: habitat notes. Tap any dot.</p>
      </div>
      <div className="space-y-3">
        <section className="card space-y-1.5 text-sm">
          <h3 className="h-section">Where things stand</h3>
          <p>
            <strong>{plan.coveys}</strong> coveys located on <strong>{formatAcres(plan.acres ?? 0)}</strong>, one per{" "}
            <strong>{Math.round(plan.acresPerCovey ?? 0)} acres</strong>
            <span className="block text-xs text-bark">Intensively managed quail ground often holds about one covey per 10–12 acres by fall.</span>
          </p>
          {plan.unscouted != null && (
            <p>
              <strong>{Math.round(plan.unscouted * 100)}%</strong> of the tract has nothing recorded within a quarter mile
            </p>
          )}
        </section>
        <section className="card space-y-2 text-sm">
          <h3 className="h-section">Covey hotspots</h3>
          {plan.hotspots.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-covey text-xs font-bold text-white">{i + 1}</span>
              <span>
                <strong>{h.n} coveys</strong> on the {h.where} side{h.birds ? ` · ~${h.birds} birds counted` : ""}
              </span>
            </div>
          ))}
        </section>
        <section className="card space-y-2 text-sm">
          <h3 className="h-section">Habitat work</h3>
          {plan.habitat
            .filter((g) => g.category !== "water")
            .map((g) => (
              <div key={g.category} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: g.info.color }}>
                  <Icon name={g.info.icon} fill className="text-[14px]" />
                </span>
                <span>
                  <strong>{g.info.label}</strong> · {g.count}
                  <span className="block text-bark">{g.info.action}</span>
                </span>
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}

function ReportDemo({ d }: { d: D }) {
  const r = useMemo(() => {
    const dates = d.hunts.filter((h) => h.season === d.season).map((h) => h.date).sort();
    return buildReport({
      period: "season",
      // Mid-season, as a manager would send it in January.
      today: dates[Math.floor(dates.length * 0.7)] ?? `${d.season.slice(0, 4)}-12-31`,
      hunts: d.hunts,
      counts: d.counts,
      marks: [...d.marks, ...d.scoutCoveys, ...d.scoutNotes],
      courses: d.courses,
      dogs: d.dogs,
    });
  }, [d]);
  const keys = ["Coveys / hour", "Contacts / hour", "Birds bagged", "Flushed wild"];
  return (
    <div className="space-y-3">
      <div className="card border-forest/30">
        <div className="flex items-start gap-3">
          <Image src="/logo-mark.png" alt="" width={44} height={44} className="h-11 w-11 rounded-lg" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-forest">Season report · {r.season}</div>
            <div className="font-display text-xl">{d.property.name}</div>
            <div className="text-xs text-bark">
              {formatWindow(r.window)} vs {formatWindow(r.prior)}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {r.kpis
            .filter((k) => keys.includes(k.label))
            .map((k) => {
              const c = change(k);
              const good = c == null || k.higherIsBetter == null ? null : (c >= 0) === k.higherIsBetter;
              return (
                <div key={k.label} className="rounded-xl border border-line bg-white p-2.5">
                  <div className="text-xs text-bark">{k.label}</div>
                  <div className="font-display text-xl">{formatKpi(k.value, k.format)}</div>
                  <div className="text-[11px] text-bark">
                    last yr {formatKpi(k.prior, k.format)}
                    {c != null && Math.abs(c) >= 0.005 && (
                      <span className={`ml-1 font-semibold ${good == null ? "" : good ? "text-forest" : "text-red-700"}`}>
                        {c >= 0 ? "▲" : "▼"} {Math.round(Math.abs(c) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      <section className="card space-y-2 border-forest/30 bg-forest-light/40 text-sm">
        <h3 className="h-section flex items-center gap-2">
          <Icon name="explore" className="text-forest" /> Outlook and recommendations
        </h3>
        <ul className="space-y-1.5">
          {r.outlook.map((o, i) => (
            <li key={i} className="flex gap-1.5">
              <Icon name="arrow_right" className="text-forest" /> <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card text-sm">
        <h3 className="h-section mb-2">Year over year</h3>
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-left text-xs text-bark">
              <th className="py-1">Season</th>
              <th className="py-1 text-right">Hunts</th>
              <th className="py-1 text-right">Coveys/hr</th>
              <th className="py-1 text-right">Birds</th>
              <th className="py-1 text-right">Juv/adult</th>
            </tr>
          </thead>
          <tbody>
            {[...r.yoy].reverse().map((y) => (
              <tr key={y.season} className="border-b border-line/60 last:border-0">
                <td className="py-1.5 font-medium">{y.season}</td>
                <td className="py-1.5 text-right tabular-nums">{y.hunts}</td>
                <td className="py-1.5 text-right tabular-nums">{y.coveysPerHour?.toFixed(1) ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{y.birds}</td>
                <td className="py-1.5 text-right tabular-nums">{y.juvPerAdult?.toFixed(2) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-bark">
        {[
          ["picture_as_pdf", "Save as PDF"],
          ["content_copy", "Copy for email"],
          ["table_view", "YOY spreadsheet"],
        ].map(([icon, label]) => (
          <div key={label} className="rounded-xl border border-dashed border-line bg-white p-2">
            <Icon name={icon} className="text-forest" />
            <div>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
