// Pure aggregation helpers shared by the dashboard pages.
import type { CoveyCountRow, CourseRow, DogRow, HuntWithRuns } from "../types/database";

export interface Totals {
  hunts: number;
  hours: number;
  pointed: number;
  shot: number;
  flushed: number;
  wild: number;
  coveysSeen: number;
  contacts: number;
  birdsOnRise: number;
  singles: number;
  cocks: number;
  hens: number;
  adult: number;
  juvenile: number;
  totalBirds: number;
}

export function totals(hunts: HuntWithRuns[]): Totals {
  const t: Totals = {
    hunts: hunts.length,
    hours: 0,
    pointed: 0,
    shot: 0,
    flushed: 0,
    wild: 0,
    coveysSeen: 0,
    contacts: 0,
    birdsOnRise: 0,
    singles: 0,
    cocks: 0,
    hens: 0,
    adult: 0,
    juvenile: 0,
    totalBirds: 0,
  };
  for (const h of hunts) {
    t.hours += h.hours_spent ?? 0;
    t.pointed += h.coveys_pointed ?? 0;
    t.shot += h.coveys_shot ?? 0;
    t.flushed += h.coveys_flushed ?? 0;
    t.wild += h.coveys_flushed_wild ?? 0;
    t.coveysSeen += h.total_coveys_seen ?? 0;
    t.contacts += h.total_contacts ?? 0;
    t.birdsOnRise += h.birds_on_covey_rise ?? 0;
    t.singles += h.singles_shot ?? 0;
    t.cocks += h.total_birds_cocks ?? 0;
    t.hens += h.total_birds_hens ?? 0;
    t.adult += h.total_birds_adult ?? 0;
    t.juvenile += h.total_birds_juvenile ?? 0;
  }
  t.totalBirds = t.adult + t.juvenile;
  return t;
}

/** a / b, or null when b is zero. */
export function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export function fmtRate(v: number | null, digits = 2): string {
  return v == null ? "—" : v.toFixed(digits);
}

export function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

export function rates(t: Totals) {
  return {
    coveysPerHour: ratio(t.coveysSeen, t.hours),
    contactsPerHour: ratio(t.contacts, t.hours),
    birdsPerHour: ratio(t.totalBirds, t.hours),
    shotVsSeen: ratio(t.shot, t.coveysSeen),
    pointedVsSeen: ratio(t.pointed, t.coveysSeen),
    pctJuvenile: ratio(t.juvenile, t.totalBirds),
    pctAdult: ratio(t.adult, t.totalBirds),
  };
}

export interface DogStat {
  dog: DogRow;
  contacts: number;
  hours: number;
  hunts: number;
  perHour: number | null;
}

export function dogStats(dogs: DogRow[], hunts: HuntWithRuns[]): DogStat[] {
  const byId = new Map<string, DogStat>();
  for (const d of dogs) byId.set(d.id, { dog: d, contacts: 0, hours: 0, hunts: 0, perHour: null });
  for (const h of hunts) {
    for (const r of h.dog_runs ?? []) {
      const s = byId.get(r.dog_id);
      if (!s) continue;
      s.contacts += r.contacts ?? 0;
      s.hours += r.hours ?? 0;
      s.hunts += 1;
    }
  }
  return [...byId.values()]
    .map((s) => ({ ...s, perHour: ratio(s.contacts, s.hours) }))
    .filter((s) => s.hunts > 0 || s.dog.active)
    .sort((a, b) => b.contacts - a.contacts || (b.perHour ?? 0) - (a.perHour ?? 0));
}

export interface CourseStat {
  course: CourseRow;
  totals: Totals;
  rates: ReturnType<typeof rates>;
}

export function courseStats(courses: CourseRow[], hunts: HuntWithRuns[]): CourseStat[] {
  return courses
    .map((course) => {
      const t = totals(hunts.filter((h) => h.course_id === course.id));
      return { course, totals: t, rates: rates(t) };
    })
    .sort((a, b) => b.totals.coveysSeen - a.totals.coveysSeen);
}

/** Courses ranked by coveys seen per hour (Hunt Advisor). */
export function advisorRanking(courses: CourseRow[], hunts: HuntWithRuns[]) {
  return courseStats(courses, hunts)
    .filter((c) => c.totals.hours > 0)
    .sort((a, b) => (b.rates.coveysPerHour ?? 0) - (a.rates.coveysPerHour ?? 0));
}

export function countSummary(courses: CourseRow[], counts: CoveyCountRow[], avgSizeOverride?: number) {
  const rows = courses.map((course) => {
    const cc = counts.filter((c) => c.course_id === course.id);
    const coveys = cc.reduce((a, c) => a + (c.coveys_heard ?? 0), 0);
    const birds = cc.reduce(
      (a, c) => a + (avgSizeOverride ? (c.coveys_heard ?? 0) * avgSizeOverride : c.estimated_birds ?? 0),
      0,
    );
    const acres = cc.reduce((a, c) => a + (c.acres_surveyed ?? 0), 0);
    return { course, surveys: cc.length, coveys, birds, acres };
  });
  return rows;
}
