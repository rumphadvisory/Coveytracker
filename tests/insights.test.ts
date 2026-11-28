import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonInsights } from "../lib/insights.ts";
import type { CoveyCountRow, CourseRow, DogRow, HuntWithRuns } from "../types/database.ts";

const course = (id: string, name: string) => ({ id, name }) as CourseRow;
const dog = (id: string, name: string) => ({ id, name, active: true }) as DogRow;
function hunt(o: Partial<HuntWithRuns> & { course_id: string }): HuntWithRuns {
  const pointed = o.coveys_pointed ?? 4, wild = o.coveys_flushed_wild ?? 1;
  return {
    hours_spent: 3, coveys_pointed: pointed, coveys_flushed_wild: wild, total_coveys_seen: pointed + wild,
    coveys_shot: 2, coveys_flushed: 0, birds_on_covey_rise: 0, singles_shot: 0,
    total_birds_cocks: 1, total_birds_hens: 1, total_birds_adult: 2, total_birds_juvenile: 3, total_contacts: 4,
    dog_runs: [], ...o,
  } as HuntWithRuns;
}
const count = (course_id: string, coveys: number) => ({ course_id, coveys_heard: coveys, avg_covey_size: 12, estimated_birds: coveys * 12 }) as CoveyCountRow;

const courses = [course("a", "Big Woods"), course("b", "Pond Field")];
const dogs = [dog("d1", "Belle"), dog("d2", "Jake")];
const runs = (h: string) => [
  { id: `${h}1`, hunt_id: h, dog_id: "d1", contacts: 4, hours: 2 },
  { id: `${h}2`, hunt_id: h, dog_id: "d2", contacts: 1, hours: 2 },
];

test("produces one insight per topic with numbers in the finding", () => {
  const hunts = [
    hunt({ id: "1", course_id: "a", coveys_pointed: 6, dog_runs: runs("1") }),
    hunt({ id: "2", course_id: "b", coveys_pointed: 2, dog_runs: runs("2") }),
  ];
  const last = [hunt({ id: "x", course_id: "a", coveys_pointed: 3 }), hunt({ id: "y", course_id: "b", coveys_pointed: 2 })];
  const ins = seasonInsights({ hunts, lastSeasonHunts: last, courses, dogs, counts: [count("a", 30), count("b", 30)] });
  assert.deepEqual(ins.map((i) => i.topic), ["course", "harvest", "trend", "reproduction", "dogs", "quality"]);
  assert.match(ins[0].finding, /^Big Woods is producing 2\.3 coveys\/hr/);
  assert.equal(ins[1].tone, "good"); // 7 birds ×1.3 ≈ 9 of a 54-bird budget per course
  assert.match(ins[2].finding, /up \d+%/);
  assert.match(ins[4].finding, /^Belle finds 2\.00 contacts\/hr/);
});

test("harvest: flags tight courses and handles 'no room left'", () => {
  const heavy = [hunt({ id: "1", course_id: "a", total_birds_adult: 30, total_birds_juvenile: 30 }), hunt({ id: "2", course_id: "b", total_birds_adult: 30, total_birds_juvenile: 30 })];
  const ins = seasonInsights({ hunts: heavy, lastSeasonHunts: [], courses, dogs, counts: [count("a", 5), count("b", 5)] });
  const h = ins.find((i) => i.topic === "harvest")!;
  assert.equal(h.tone, "watch");
  assert.match(h.finding, /Big Woods \d+%, Pond Field \d+%|Pond Field \d+%, Big Woods \d+%/);
  assert.match(h.action, /No course has room left/);
});

test("trend bands: small changes read as holding steady, not a decline", () => {
  const mk = (p: number) => [hunt({ id: "1", course_id: "a", coveys_pointed: p })];
  const steady = seasonInsights({ hunts: mk(4), lastSeasonHunts: mk(4), courses, dogs, counts: [] }).find((i) => i.topic === "trend")!;
  assert.match(steady.finding, /holding steady/);
  assert.equal(steady.tone, "good");
  const down = seasonInsights({ hunts: mk(2), lastSeasonHunts: mk(6), courses, dogs, counts: [] }).find((i) => i.topic === "trend")!;
  assert.equal(down.tone, "watch");
  assert.match(down.finding, /down \d+%/);
});
