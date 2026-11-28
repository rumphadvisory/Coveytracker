import { test } from "node:test";
import assert from "node:assert/strict";
import { direction, findHotspots, planText, scoutingPlan, unscoutedShare } from "../lib/scouting.ts";
import type { BoundaryShape, GpsMarkRow } from "../types/database.ts";

const C = { lat: 32.0, lng: -85.6 };
// ~1 km square around C
const square: BoundaryShape[] = [{ name: "Farm", rings: [[[-85.6053, 31.9955], [-85.5947, 31.9955], [-85.5947, 32.0045], [-85.6053, 32.0045]]] }];
let n = 0;
const mark = (dLat: number, dLng: number, o: Partial<GpsMarkRow> = {}): GpsMarkRow =>
  ({ id: `m${n++}`, type: "covey", lat: C.lat + dLat, lng: C.lng + dLng, category: "seen", birds: null, notes: null, ...o }) as GpsMarkRow;

test("direction names", () => {
  assert.equal(direction(C, { lat: C.lat + 0.01, lng: C.lng }), "north");
  assert.equal(direction(C, { lat: C.lat - 0.01, lng: C.lng + 0.01 }), "southeast");
  assert.equal(direction(C, { lat: C.lat, lng: C.lng - 0.01 }), "west");
  assert.equal(direction(C, C), "center");
});

test("hotspots group nearby coveys and leave lone ones", () => {
  const coveys = [
    mark(0.003, 0.003, { birds: 12 }), mark(0.0033, 0.0031, { birds: 10 }), mark(0.0029, 0.0035), // NE cluster
    mark(-0.003, -0.003), mark(-0.0031, -0.0028), // SW pair
    mark(0.003, -0.0035), // lone NW
  ];
  const { hotspots, lone } = findHotspots(coveys, C);
  assert.equal(hotspots.length, 2);
  assert.equal(lone, 1);
  assert.equal(hotspots[0].n, 3);
  assert.equal(hotspots[0].where, "northeast");
  assert.equal(hotspots[0].birds, 22);
  assert.equal(hotspots[1].where, "southwest");
  assert.equal(hotspots[1].course, null);
});

test("hotspot inside a course outline is labeled with it", () => {
  const course = { name: "North Course", boundary: [{ name: "N", rings: [[[-85.61, 32.001], [-85.59, 32.001], [-85.59, 32.01], [-85.61, 32.01]]] }] as BoundaryShape[] };
  const { hotspots } = findHotspots([mark(0.003, 0), mark(0.0032, 0.0002)], C, [course]);
  assert.equal(hotspots[0].course, "North Course");
});

test("unscouted share falls as ground is covered", () => {
  assert.equal(unscoutedShare(null, []), null);
  assert.equal(unscoutedShare(square, []), 1);
  const some = unscoutedShare(square, [{ lat: C.lat, lng: C.lng }])!;
  assert.ok(some > 0.2 && some < 0.8, `got ${some}`);
  const corners = [-0.003, 0, 0.003].flatMap((a) => [-0.003, 0, 0.003].map((b) => ({ lat: C.lat + a, lng: C.lng + b })));
  assert.equal(unscoutedShare(square, corners), 0);
});

test("plan summarizes coveys, density, habitat and steps", () => {
  const coveys = [mark(0.003, 0.003, { category: "heard", birds: 14 }), mark(0.0032, 0.0031), mark(-0.003, -0.003, { category: null })];
  const notes = [
    mark(0, 0, { type: "scout", category: "burn", notes: "Broomsedge too thick" }),
    mark(0.001, 0, { type: "scout", category: "burn" }),
    mark(0.002, 0, { type: "scout", category: "predator", notes: "Coon tracks at the creek" }),
  ];
  const plan = scoutingPlan({ coveys, notes, boundary: square, center: C, courses: [] });
  assert.equal(plan.coveys, 3);
  assert.deepEqual(plan.byHow, { seen: 1, heard: 1, flushed: 0, other: 1 });
  assert.equal(plan.birdsCounted, 14);
  assert.ok(plan.acres! > 240 && plan.acres! < 260, `acres ${plan.acres}`);
  assert.ok(Math.abs(plan.acresPerCovey! - plan.acres! / 3) < 1);
  assert.equal(plan.hotspots.length, 1);
  assert.equal(plan.habitat[0].category, "burn");
  assert.equal(plan.habitat[0].count, 2);
  assert.deepEqual(plan.habitat[0].notes, ["Broomsedge too thick"]);
  assert.ok(plan.steps.some((s) => s.href === "/boundaries" && /hotspots/.test(s.text)));
  assert.ok(plan.steps.some((s) => s.href === "/counts"));
  assert.ok(plan.steps.some((s) => s.text.includes("needs burning (2), predator sign (1)")));
  const text = planText("WindSong", plan, new Date(2026, 10, 28));
  assert.match(text, /WindSong: scouting and development plan/);
  assert.match(text, /Coon tracks at the creek/);
});

test("plan without a boundary asks for one and still works", () => {
  const plan = scoutingPlan({ coveys: [mark(0, 0)], notes: [], boundary: null, center: C, courses: [] });
  assert.equal(plan.acres, null);
  assert.equal(plan.unscouted, null);
  assert.equal(plan.steps[0].href, "/boundaries");
  assert.ok(plan.steps.some((s) => /Keep scouting/.test(s.text)));
});
