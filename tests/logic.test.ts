import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonForDate, seasonList } from "../lib/seasons.ts";
import { compass, parseConditions, pressureNote, scentingScore } from "../lib/weather.ts";
import { harvestLine, pressureLevel } from "../lib/harvest.ts";
import { dogStats, rates, totals } from "../lib/stats.ts";
import type { DogRow, HuntWithRuns } from "../types/database.ts";

test("season boundary is August", () => {
  assert.equal(seasonForDate("2025-07-31"), "2024-2025");
  assert.equal(seasonForDate("2025-08-01"), "2025-2026");
  assert.equal(seasonForDate("2026-01-15"), "2025-2026");
  assert.deepEqual(seasonList(["2023-2024", "2023-2024", null]).slice(-1), ["2023-2024"]);
});

test("scenting model matches spec thresholds", () => {
  assert.equal(scentingScore({ temperature: 45, humidity: 75, windSpeed: 5, dewPoint: 40 }).rating, "Excellent"); // 10
  assert.equal(scentingScore({ temperature: 60, humidity: 75, windSpeed: 10, dewPoint: 40 }).score, 8); // 2+3+1+2
  assert.equal(scentingScore({ temperature: 60, humidity: 50, windSpeed: 10, dewPoint: 55 }).rating, "Good"); // 2+2+1+1
  assert.equal(scentingScore({ temperature: 70, humidity: 35, windSpeed: 12, dewPoint: 62 }).rating, "Poor"); // 1+1+1+0
  assert.equal(scentingScore({ temperature: 70, humidity: 50, windSpeed: 20, dewPoint: 55 }).rating, "Fair"); // 1+2+0+1
});

test("pressure note and compass", () => {
  assert.equal(pressureNote(30.15).level, "high");
  assert.equal(pressureNote(29.95).level, "normal");
  assert.equal(pressureNote(29.6).level, "low");
  assert.equal(compass(0), "N");
  assert.equal(compass(315), "NW");
  assert.equal(compass(359), "N");
});

test("parses Open-Meteo response and converts hPa to inHg", () => {
  const c = parseConditions({
    current: {
      temperature_2m: 48.2,
      apparent_temperature: 45,
      relative_humidity_2m: 71,
      dew_point_2m: 39,
      surface_pressure: 1012,
      pressure_msl: 1020.5,
      wind_speed_10m: 6,
      wind_direction_10m: 300,
      wind_gusts_10m: 12,
      weather_code: 2,
    },
    current_units: { pressure_msl: "hPa", surface_pressure: "hPa" },
  });
  assert.equal(c.description, "Partly Cloudy");
  assert.ok(Math.abs(c.pressure - 30.13) < 0.01, `pressure ${c.pressure}`);
});

test("harvest budget applies 1.3x unrecovered multiplier", () => {
  const l = harvestLine(240, 20, 0.15); // budget 36, harvested 26
  assert.equal(l.budget, 36);
  assert.equal(l.harvested, 26);
  assert.equal(l.remaining, 10);
  assert.equal(l.pressure, "yellow");
  assert.equal(pressureLevel(0.5, 5), "green");
  assert.equal(pressureLevel(1.2, 5), "red");
  assert.equal(pressureLevel(null, 0), "none");
});

const hunt = (o: Partial<HuntWithRuns>): HuntWithRuns =>
  ({
    hours_spent: 0, coveys_pointed: 0, coveys_shot: 0, coveys_flushed: 0, coveys_flushed_wild: 0,
    total_coveys_seen: 0, birds_on_covey_rise: 0, singles_shot: 0, total_birds_cocks: 0, total_birds_hens: 0,
    total_birds_adult: 0, total_birds_juvenile: 0, total_contacts: 0, dog_runs: [], ...o,
  }) as HuntWithRuns;

test("totals, rates and dog ranking", () => {
  const hunts = [
    hunt({ hours_spent: 3, total_coveys_seen: 6, coveys_shot: 3, total_birds_adult: 4, total_birds_juvenile: 4, total_contacts: 5,
      dog_runs: [{ id: "r1", hunt_id: "h1", dog_id: "a", contacts: 2, hours: 1.5 }, { id: "r2", hunt_id: "h1", dog_id: "b", contacts: 3, hours: 1.5 }] }),
    hunt({ hours_spent: 1, total_coveys_seen: 2, dog_runs: [{ id: "r3", hunt_id: "h2", dog_id: "a", contacts: 4, hours: 1 }] }),
  ];
  const t = totals(hunts);
  assert.equal(t.coveysSeen, 8);
  assert.equal(t.totalBirds, 8);
  const r = rates(t);
  assert.equal(r.coveysPerHour, 2);
  assert.equal(r.pctJuvenile, 0.5);
  const dogs = [{ id: "a", name: "Belle", active: true }, { id: "b", name: "Jake", active: true }] as DogRow[];
  const ds = dogStats(dogs, hunts);
  assert.equal(ds[0].dog.name, "Belle");
  assert.equal(ds[0].contacts, 6);
  assert.equal(ds[0].hunts, 2);
  assert.equal(ds[1].perHour, 2);
});
