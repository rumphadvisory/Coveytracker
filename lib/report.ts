// Season performance & outlook report: a week, month or season-to-date compared with the same
// dates last year, plus courses, harvest, dogs, population, scouting, recommendations and a
// year-over-year table for multi-year management plans. Pure functions; rendered by /report.
import { DEFAULT_HARVEST_RATE, harvestLine, type HarvestLine } from "./harvest.ts";
import { seasonInsights, type Insight } from "./insights.ts";
import { advisorRanking, countSummary, dogStats, ratio, rates, totals } from "./stats.ts";
import type { CoveyCountRow, CourseRow, DogRow, GpsMarkRow, HuntWithRuns } from "../types/database";

export type Period = "week" | "month" | "season";

export const PERIOD_LABEL: Record<Period, string> = { week: "Weekly", month: "Monthly", season: "Season to date" };

export interface DateWindow {
  start: string; // YYYY-MM-DD, inclusive
  end: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Season a date falls in (Aug–Jul), e.g. "2026-2027". */
export function seasonOf(date: string): string {
  const d = parse(date);
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

export function periodWindow(period: Period, today: string): DateWindow {
  const d = parse(today);
  if (period === "week") return { start: iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6)), end: today };
  if (period === "month") return { start: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end: today };
  return { start: `${seasonOf(today).slice(0, 4)}-08-01`, end: today };
}

/** The same dates one year earlier (Feb 29 → Feb 28). */
export function lastYear(w: DateWindow): DateWindow {
  const back = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    const last = new Date(y - 1, m, 0).getDate();
    return `${y - 1}-${pad(m)}-${pad(Math.min(d, last))}`;
  };
  return { start: back(w.start), end: back(w.end) };
}

const within = (date: string, w: DateWindow) => date >= w.start && date <= w.end;

export function formatWindow(w: DateWindow): string {
  const a = parse(w.start);
  const b = parse(w.end);
  const sameYear = a.getFullYear() === b.getFullYear();
  const f = (d: Date, withYear: boolean) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  return `${f(a, !sameYear)} – ${f(b, true)}`;
}

export type KpiFormat = "int" | "rate" | "pct" | "hours";

export interface Kpi {
  label: string;
  value: number | null;
  prior: number | null;
  format: KpiFormat;
  /** Whether a higher number is the good direction (null = neither). */
  higherIsBetter: boolean | null;
}

export function formatKpi(v: number | null, f: KpiFormat): string {
  if (v == null) return "—";
  if (f === "pct") return `${Math.round(v * 100)}%`;
  if (f === "rate") return v.toFixed(2);
  if (f === "hours") return `${+v.toFixed(1)}`;
  return String(Math.round(v));
}

/** Change vs prior as a fraction (null when there's nothing to compare). */
export function change(k: Pick<Kpi, "value" | "prior">): number | null {
  if (k.value == null || k.prior == null || k.prior === 0) return null;
  return k.value / k.prior - 1;
}

function kpis(now: HuntWithRuns[], before: HuntWithRuns[]): Kpi[] {
  const a = totals(now);
  const b = totals(before);
  const ra = rates(a);
  const rb = rates(b);
  return [
    { label: "Hunts", value: a.hunts, prior: b.hunts, format: "int", higherIsBetter: null },
    { label: "Hours hunted", value: a.hours, prior: b.hours, format: "hours", higherIsBetter: null },
    { label: "Coveys seen", value: a.coveysSeen, prior: b.coveysSeen, format: "int", higherIsBetter: true },
    { label: "Coveys / hour", value: ra.coveysPerHour, prior: rb.coveysPerHour, format: "rate", higherIsBetter: true },
    { label: "Contacts / hour", value: ra.contactsPerHour, prior: rb.contactsPerHour, format: "rate", higherIsBetter: true },
    { label: "Birds bagged", value: a.totalBirds, prior: b.totalBirds, format: "int", higherIsBetter: null },
    { label: "Shot on / seen", value: ra.shotVsSeen, prior: rb.shotVsSeen, format: "pct", higherIsBetter: true },
    { label: "Flushed wild", value: ratio(a.wild, a.coveysSeen), prior: ratio(b.wild, b.coveysSeen), format: "pct", higherIsBetter: false },
  ];
}

export interface CourseLine {
  name: string;
  hunts: number;
  hours: number;
  coveysPerHour: number | null;
  harvest: HarvestLine | null;
}

export interface DogLine {
  name: string;
  hunts: number;
  contacts: number;
  perHour: number | null;
}

export interface YoyRow {
  season: string;
  hunts: number;
  hours: number;
  coveysSeen: number;
  coveysPerHour: number | null;
  birds: number;
  birdsPerHour: number | null;
  juvPerAdult: number | null;
  wildRate: number | null;
  countCoveys: number | null;
  countBirds: number | null;
}

export interface Report {
  period: Period;
  window: DateWindow;
  prior: DateWindow;
  season: string;
  kpis: Kpi[];
  seasonKpis: Kpi[];
  courses: CourseLine[];
  dogs: DogLine[];
  harvest: { budget: number; harvested: number; remaining: number; used: number | null; perWeek: number | null; weeksLeft: number | null } | null;
  population: { coveys: number; birds: number; priorCoveys: number | null; priorBirds: number | null } | null;
  scouting: { coveys: number; notes: number };
  highlights: string[];
  insights: Insight[];
  outlook: string[];
  yoy: YoyRow[];
}

export interface ReportInput {
  period: Period;
  today: string;
  hunts: HuntWithRuns[]; // all seasons
  counts: CoveyCountRow[]; // all seasons
  marks: GpsMarkRow[]; // all seasons
  courses: CourseRow[];
  dogs: DogRow[];
  harvestRate?: number;
}

const r1 = (x: number) => x.toFixed(1);

export function buildReport(input: ReportInput): Report {
  const { period, today, hunts, counts, marks, courses, dogs, harvestRate = DEFAULT_HARVEST_RATE } = input;
  const window = periodWindow(period, today);
  const prior = lastYear(window);
  const season = seasonOf(today);
  const lastSeason = `${Number(season.slice(0, 4)) - 1}-${season.slice(0, 4)}`;
  const std = periodWindow("season", today);
  const stdPrior = lastYear(std);

  const inPeriod = hunts.filter((h) => within(h.date, window));
  const inPrior = hunts.filter((h) => within(h.date, prior));
  const seasonHunts = hunts.filter((h) => within(h.date, std));
  const seasonPrior = hunts.filter((h) => within(h.date, stdPrior));

  // Harvest uses this season's fall covey counts as the population.
  const seasonCounts = counts.filter((c) => c.season === season);
  const pop = countSummary(courses, seasonCounts);
  const courseLines: CourseLine[] = courses
    .map((c) => {
      const t = totals(seasonHunts.filter((h) => h.course_id === c.id));
      const birds = pop.find((p) => p.course.id === c.id)?.birds ?? 0;
      return {
        name: c.name,
        hunts: t.hunts,
        hours: t.hours,
        coveysPerHour: rates(t).coveysPerHour,
        harvest: birds > 0 ? harvestLine(birds, t.totalBirds, harvestRate) : null,
      };
    })
    .filter((c) => c.hunts > 0 || c.harvest)
    .sort((a, b) => (b.coveysPerHour ?? -1) - (a.coveysPerHour ?? -1));

  const withBudget = courseLines.filter((c) => c.harvest);
  let harvest: Report["harvest"] = null;
  if (withBudget.length) {
    const budget = withBudget.reduce((a, c) => a + c.harvest!.budget, 0);
    const harvested = withBudget.reduce((a, c) => a + c.harvest!.harvested, 0);
    const first = seasonHunts.map((h) => h.date).sort()[0];
    const weeks = first ? Math.max(1, (parse(today).getTime() - parse(first).getTime()) / (7 * 86_400_000)) : null;
    const perWeek = weeks && harvested ? harvested / weeks : null;
    const remaining = budget - harvested;
    harvest = { budget, harvested, remaining, used: budget ? harvested / budget : null, perWeek, weeksLeft: perWeek && remaining > 0 ? remaining / perWeek : null };
  }

  const priorCounts = counts.filter((c) => c.season === lastSeason);
  const sum = (cs: CoveyCountRow[], k: "coveys_heard" | "estimated_birds") => cs.reduce((a, c) => a + (c[k] ?? 0), 0);
  const population = seasonCounts.length
    ? {
        coveys: sum(seasonCounts, "coveys_heard"),
        birds: sum(seasonCounts, "estimated_birds"),
        priorCoveys: priorCounts.length ? sum(priorCounts, "coveys_heard") : null,
        priorBirds: priorCounts.length ? sum(priorCounts, "estimated_birds") : null,
      }
    : null;

  const markDate = (m: GpsMarkRow) => m.timestamp.slice(0, 10);
  const scouting = {
    coveys: marks.filter((m) => m.type === "covey" && !m.hunt_id && within(markDate(m), window)).length,
    notes: marks.filter((m) => m.type === "scout" && within(markDate(m), window)).length,
  };

  const courseName = (id: string | null) => courses.find((c) => c.id === id)?.name ?? "a course";
  const highlights: string[] = [];
  const best = [...inPeriod].filter((h) => h.hours_spent).sort((a, b) => (b.total_coveys_seen ?? 0) / (b.hours_spent ?? 1) - (a.total_coveys_seen ?? 0) / (a.hours_spent ?? 1))[0];
  if (best)
    highlights.push(
      `Best hunt: ${courseName(best.course_id)} on ${parse(best.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${best.total_coveys_seen ?? 0} coveys in ${best.hours_spent} hours.`,
    );
  for (const h of inPeriod.filter((h) => h.comments?.trim()).slice(0, 3)) highlights.push(`${courseName(h.course_id)}: "${h.comments!.trim()}"`);

  const insights = seasonInsights({ hunts: seasonHunts, lastSeasonHunts: seasonPrior, courses, dogs, counts: seasonCounts, harvestRate });

  // Outlook: what to do next.
  const outlook: string[] = [];
  if (harvest) {
    if (harvest.remaining <= 0)
      outlook.push(`The property is at or over its harvest budget (${harvest.harvested} of ${harvest.budget} birds, counting 1.3× for unrecovered). Limit shooting for the rest of the season.`);
    else
      outlook.push(
        `${harvest.remaining} birds left in the season's harvest budget (${Math.round((harvest.used ?? 0) * 100)}% used).${
          harvest.weeksLeft != null ? ` At the current pace of ${Math.round(harvest.perWeek!)} a week, that lasts about ${Math.round(harvest.weeksLeft)} more weeks.` : ""
        }`,
      );
  }
  const ranked = advisorRanking(courses, seasonHunts);
  const roomy = ranked.filter((c) => {
    const line = courseLines.find((l) => l.name === c.course.name)?.harvest;
    return !line || (line.used ?? 0) < 0.85;
  });
  const rest = courseLines.filter((c) => c.harvest && (c.harvest.used ?? 0) >= 0.85).map((c) => c.name);
  if (roomy.length)
    outlook.push(
      `Hunt next: ${roomy
        .slice(0, 2)
        .map((c) => `${c.course.name} (${r1(c.rates.coveysPerHour ?? 0)} coveys/hr)`)
        .join(" and ")}.${rest.length ? ` Rest or go light on ${rest.join(", ")}.` : ""}`,
    );
  else if (rest.length) outlook.push(`Rest or go light on ${rest.join(", ")}.`);
  const periodRate = kpis(inPeriod, inPrior)[3];
  const ch = change(periodRate);
  if (ch != null && period !== "season")
    outlook.push(`Coveys per hour this ${period} are ${ch >= 0 ? "up" : "down"} ${Math.round(Math.abs(ch) * 100)}% on the same dates last year.`);
  // Harvest advice is already covered above.
  for (const i of insights.filter((i) => i.tone === "watch" && i.topic !== "harvest")) outlook.push(i.action);

  // Year over year, oldest first.
  const seasons = [...new Set([...hunts.map((h) => h.season), ...counts.map((c) => c.season)])].filter(Boolean).sort();
  const yoy: YoyRow[] = seasons.map((s) => {
    const t = totals(hunts.filter((h) => h.season === s));
    const r = rates(t);
    const cs = counts.filter((c) => c.season === s);
    return {
      season: s,
      hunts: t.hunts,
      hours: t.hours,
      coveysSeen: t.coveysSeen,
      coveysPerHour: r.coveysPerHour,
      birds: t.totalBirds,
      birdsPerHour: r.birdsPerHour,
      juvPerAdult: ratio(t.juvenile, t.adult),
      wildRate: ratio(t.wild, t.coveysSeen),
      countCoveys: cs.length ? sum(cs, "coveys_heard") : null,
      countBirds: cs.length ? sum(cs, "estimated_birds") : null,
    };
  });

  return {
    period,
    window,
    prior,
    season,
    kpis: kpis(inPeriod, inPrior),
    seasonKpis: kpis(seasonHunts, seasonPrior),
    courses: courseLines,
    dogs: dogStats(dogs, seasonHunts)
      .filter((d) => d.hunts > 0)
      .sort((a, b) => (b.perHour ?? 0) - (a.perHour ?? 0))
      .map((d) => ({ name: d.dog.name, hunts: d.hunts, contacts: d.contacts, perHour: d.perHour })),
    harvest,
    population,
    scouting,
    highlights,
    insights,
    outlook,
    yoy,
  };
}

const sign = (x: number) => `${x >= 0 ? "+" : "−"}${Math.round(Math.abs(x) * 100)}%`;

/** Plain-text report for an email to the owners. */
export function reportText(propertyName: string, r: Report): string {
  const L: string[] = [];
  L.push(`${propertyName}: ${PERIOD_LABEL[r.period]} report, ${formatWindow(r.window)}`, "");
  const line = (k: Kpi) => {
    const c = change(k);
    return `  ${k.label}: ${formatKpi(k.value, k.format)}${k.prior != null ? ` (last year ${formatKpi(k.prior, k.format)}${c != null ? `, ${sign(c)}` : ""})` : ""}`;
  };
  L.push(r.period === "season" ? "Season to date vs same dates last season:" : `This ${r.period} vs same dates last year:`);
  r.kpis.forEach((k) => L.push(line(k)));
  if (r.period !== "season") {
    L.push("", `Season to date (${r.season}):`);
    r.seasonKpis.forEach((k) => L.push(line(k)));
  }
  if (r.outlook.length) {
    L.push("", "Outlook and recommendations:");
    r.outlook.forEach((o) => L.push(`  - ${o}`));
  }
  if (r.insights.length) {
    L.push("", "Management insights:");
    r.insights.forEach((i) => L.push(`  - ${i.title}: ${i.finding} ${i.action}`));
  }
  if (r.courses.length) {
    L.push("", "Courses (season to date):");
    r.courses.forEach((c) =>
      L.push(
        `  ${c.name}: ${c.hunts} hunts, ${c.coveysPerHour != null ? r1(c.coveysPerHour) : "—"} coveys/hr${
          c.harvest ? `, harvest ${c.harvest.harvested}/${c.harvest.budget} (${Math.round((c.harvest.used ?? 0) * 100)}%)` : ""
        }`,
      ),
    );
  }
  if (r.dogs.length) {
    L.push("", "Dogs (season to date):");
    r.dogs.forEach((d) => L.push(`  ${d.name}: ${d.contacts} contacts in ${d.hunts} hunts, ${d.perHour != null ? d.perHour.toFixed(2) : "—"}/hr`));
  }
  if (r.population)
    L.push(
      "",
      `Fall covey counts: ${r.population.coveys} coveys heard, about ${r.population.birds} birds${
        r.population.priorCoveys != null ? ` (last season ${r.population.priorCoveys} coveys, ${r.population.priorBirds} birds)` : ""
      }.`,
    );
  if (r.scouting.coveys || r.scouting.notes) L.push("", `Scouting this period: ${r.scouting.coveys} coveys located, ${r.scouting.notes} habitat notes.`);
  if (r.highlights.length) {
    L.push("", "Highlights:");
    r.highlights.forEach((h) => L.push(`  - ${h}`));
  }
  if (r.yoy.length > 1) {
    L.push("", "Year over year:");
    r.yoy.forEach((y) =>
      L.push(
        `  ${y.season}: ${y.hunts} hunts, ${y.coveysPerHour != null ? r1(y.coveysPerHour) : "—"} coveys/hr, ${y.birds} birds${
          y.countCoveys != null ? `, fall count ${y.countCoveys} coveys` : ""
        }`,
      ),
    );
  }
  return L.join("\n");
}

const csvCell = (v: string | number | null) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(+v.toFixed(3)) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Year-over-year table as CSV, for spreadsheets and slides. */
export function yoyCsv(rows: YoyRow[]): string {
  const head = ["Season", "Hunts", "Hours", "Coveys seen", "Coveys per hour", "Birds bagged", "Birds per hour", "Juveniles per adult", "Flushed wild %", "Fall count coveys", "Fall count birds"];
  const body = rows.map((y) =>
    [y.season, y.hunts, y.hours, y.coveysSeen, y.coveysPerHour, y.birds, y.birdsPerHour, y.juvPerAdult, y.wildRate != null ? y.wildRate * 100 : null, y.countCoveys, y.countBirds].map(csvCell).join(","),
  );
  return [head.join(","), ...body].join("\n");
}
