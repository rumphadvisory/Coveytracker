import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, change, formatWindow, lastYear, periodWindow, reportText, seasonOf, yoyCsv } from "../lib/report.ts";
import type { CoveyCountRow, CourseRow, DogRow, HuntWithRuns } from "../types/database.ts";

const courses = [{ id: "c1", name: "Big Woods" }, { id: "c2", name: "Pond Field" }] as CourseRow[];
const dogs = [{ id: "d1", name: "Belle", active: true }, { id: "d2", name: "Jake", active: true }] as DogRow[];
let n = 0;
function hunt(date: string, course_id: string, seen: number, hours = 3, birds = 4, extra: Partial<HuntWithRuns> = {}): HuntWithRuns {
  return {
    id: `h${n++}`, date, season: seasonOf(date), course_id, hours_spent: hours, total_coveys_seen: seen, coveys_pointed: seen - 1,
    coveys_flushed_wild: 1, coveys_shot: Math.floor(seen / 2), coveys_flushed: 0, birds_on_covey_rise: 0, singles_shot: 0,
    total_birds_cocks: 1, total_birds_hens: 1, total_birds_adult: 2, total_birds_juvenile: birds - 2, total_contacts: seen,
    comments: null, dog_runs: [{ id: `r${n}a`, hunt_id: "", dog_id: "d1", contacts: seen - 1, hours: hours / 2 }, { id: `r${n}b`, hunt_id: "", dog_id: "d2", contacts: 1, hours: hours / 2 }],
    ...extra,
  } as HuntWithRuns;
}
const count = (season: string, course_id: string, heard: number) => ({ id: `k${n++}`, season, course_id, coveys_heard: heard, estimated_birds: heard * 12 }) as CoveyCountRow;

test("windows and seasons", () => {
  assert.equal(seasonOf("2026-11-28"), "2026-2027");
  assert.equal(seasonOf("2027-02-10"), "2026-2027");
  assert.deepEqual(periodWindow("week", "2026-11-28"), { start: "2026-11-22", end: "2026-11-28" });
  assert.deepEqual(periodWindow("month", "2026-11-28"), { start: "2026-11-01", end: "2026-11-28" });
  assert.deepEqual(periodWindow("season", "2027-01-05"), { start: "2026-08-01", end: "2027-01-05" });
  assert.deepEqual(lastYear({ start: "2028-02-29", end: "2028-03-05" }), { start: "2027-02-28", end: "2027-03-05" });
  assert.match(formatWindow({ start: "2026-11-22", end: "2026-11-28" }), /Nov 22 – Nov 28, 2026/);
  assert.equal(change({ value: 3, prior: 2 }), 0.5);
  assert.equal(change({ value: 3, prior: 0 }), null);
});

test("weekly report compares with the same dates last year", () => {
  const hunts = [
    hunt("2026-11-24", "c1", 9), hunt("2026-11-27", "c2", 4, 3, 6, { comments: "Birds held tight" }),
    hunt("2026-11-10", "c1", 6), // earlier this season, outside the week
    hunt("2025-11-25", "c1", 5), hunt("2025-12-10", "c2", 3), // last season
  ];
  const counts = [count("2026-2027", "c1", 10), count("2026-2027", "c2", 3), count("2025-2026", "c1", 8)];
  const r = buildReport({ period: "week", today: "2026-11-28", hunts, counts, marks: [], courses, dogs });
  const k = Object.fromEntries(r.kpis.map((x) => [x.label, x]));
  assert.equal(k["Hunts"].value, 2);
  assert.equal(k["Hunts"].prior, 1);
  assert.equal(k["Coveys seen"].value, 13);
  assert.equal(k["Coveys seen"].prior, 5);
  assert.equal(r.seasonKpis[0].value, 3); // season to date
  assert.equal(r.seasonKpis[0].prior, 1); // last season to the same date
  assert.equal(r.courses[0].name, "Big Woods"); // best coveys/hr first
  // Big Woods: 10 coveys × 12 = 120 birds, budget 18; bag 8 → 10 harvested (×1.3)
  assert.equal(r.courses[0].harvest!.budget, 18);
  assert.equal(r.courses[0].harvest!.harvested, 10);
  // Pond Field: 36 birds, budget 5; bag 6 → 8 harvested: over budget, so rest it
  assert.ok(r.outlook.some((o) => /Rest or go light on Pond Field/.test(o)));
  assert.ok(r.outlook.some((o) => /Hunt next: Big Woods/.test(o)));
  assert.ok(r.outlook.some((o) => /birds left in the season's harvest budget/.test(o)));
  assert.equal(r.dogs[0].name, "Belle");
  assert.deepEqual(r.population, { coveys: 13, birds: 156, priorCoveys: 8, priorBirds: 96 });
  assert.ok(r.highlights[0].startsWith("Best hunt: Big Woods"));
  assert.ok(r.highlights.some((h) => h.includes("Birds held tight")));
  assert.deepEqual(r.yoy.map((y) => [y.season, y.hunts, y.countCoveys]), [["2025-2026", 2, 8], ["2026-2027", 3, 13]]);
  const text = reportText("WindSong", r);
  assert.match(text, /WindSong: Weekly report/);
  assert.match(text, /Coveys seen: 13 \(last year 5, \+160%\)/);
  const csv = yoyCsv(r.yoy).split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[0], /^Season,Hunts,Hours/);
  assert.match(csv[2], /^2026-2027,3,9,19,/);
});

test("harvest pace is weighed against the end of the season", () => {
  const counts = [count("2026-2027", "c1", 40)]; // 480 birds, budget 72
  const early = [hunt("2026-11-10", "c1", 6, 3, 4), hunt("2026-11-20", "c1", 6, 3, 4)];
  const r1 = buildReport({ period: "season", today: "2026-11-24", hunts: early, counts, marks: [], courses, dogs });
  assert.ok(r1.outlook.some((o) => /lasts about \d+ more weeks, before the season ends/.test(o)), r1.outlook.join(" | "));
  const late = [hunt("2027-02-01", "c1", 6, 3, 4), hunt("2027-02-15", "c1", 6, 3, 4)];
  const r2 = buildReport({ period: "season", today: "2027-02-20", hunts: late, counts, marks: [], courses, dogs });
  assert.ok(r2.outlook.some((o) => /covers the rest of the season/.test(o)), r2.outlook.join(" | "));
});

test("empty property still builds a report", () => {
  const r = buildReport({ period: "season", today: "2026-11-28", hunts: [], counts: [], marks: [], courses, dogs });
  assert.equal(r.kpis[0].value, 0);
  assert.equal(r.harvest, null);
  assert.equal(r.population, null);
  assert.deepEqual(r.yoy, []);
  assert.match(reportText("X", r), /Season to date/);
});
