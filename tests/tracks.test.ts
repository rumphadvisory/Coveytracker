import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, matchDog, metersToMiles, parseGpxTracks, positionAt, thin, trackStats, trimToDate } from "../lib/tracks.ts";
import type { DogRow } from "../types/database.ts";

// A dog trotting due north ~3 m/s for 10 minutes, sampled every 2.5 s like a T5 collar,
// standing still (on point) for the last 2 minutes, plus one bad GPS jump.
const T0 = Date.UTC(2026, 11, 5, 15, 0, 0) / 1000; // 10:00 Eastern
const LAT0 = 32.03, LNG0 = -85.62;
const M_PER_DEG = 111_195; // metres per degree latitude used by the haversine radius
function gpx(name: string) {
  let pts = "";
  let lat = LAT0;
  for (let i = 0; i <= 288; i++) {
    const t = T0 + i * 2.5;
    if (i <= 240) lat = LAT0 + (i * 2.5 * 3) / M_PER_DEG; // moving 3 m/s
    const jump = i === 100 ? 0.05 : 0; // ~5.5 km spike, filtered out
    pts += `<trkpt lat="${(lat + jump).toFixed(7)}" lon="${LNG0}"><ele>110</ele><time>${new Date(t * 1000).toISOString()}</time></trkpt>\n`;
  }
  return `<trk><name>${name}</name><extensions><gpxx:TrackExtension><gpxx:DisplayColor>Red</gpxx:DisplayColor></gpxx:TrackExtension></extensions><trkseg>${pts}</trkseg></trk>`;
}
const file = `<?xml version="1.0"?><gpx creator="Astro 430" xmlns="http://www.topografix.com/GPX/1/1">
<wpt lat="32.03" lon="-85.62"><name>Truck</name></wpt>${gpx("Belle")}${gpx("JAKE &amp; co")}</gpx>`;

test("parses one track per dog from a Garmin GPX, ignoring waypoints and extensions", () => {
  const tracks = parseGpxTracks(file);
  assert.deepEqual(tracks.map((t) => t.name), ["Belle", "JAKE & co"]);
  assert.equal(tracks[0].points.length, 289);
  assert.equal(tracks[0].points[0][2], T0);
});

test("distance skips GPS jumps; moving time excludes standing on point", () => {
  const s = trackStats(parseGpxTracks(file)[0].points);
  const expectedM = 240 * 2.5 * 3; // 1800 m; the jump to and back from the spike is dropped
  assert.ok(Math.abs(s.distanceM - expectedM) < 30, `distance ${s.distanceM}`);
  assert.equal(s.durationS, 288 * 2.5);
  assert.ok(Math.abs(s.movingS - 600) <= 10, `moving ${s.movingS}`); // ~10 min moving, 2 min standing
  assert.ok(Math.abs(metersToMiles(s.distanceM) - 1.118) < 0.02);
});

test("trim to the hunt date, thin, match dogs and find positions", () => {
  const pts = parseGpxTracks(file)[0].points;
  const other = pts.map(([x, y, t]) => [x, y, t - 86400 * 3] as [number, number, number]);
  const day = new Date(T0 * 1000);
  const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const r = trimToDate([...other, ...pts], date);
  assert.equal(r.points.length, pts.length);
  assert.equal(r.trimmed, true);
  assert.equal(trimToDate(pts, "1999-01-01").trimmed, false); // nothing on that day: keep all

  const t = thin(pts, 5);
  assert.ok(t.length < pts.length / 1.8 && t[0] === pts[0] && t[t.length - 1] === pts[pts.length - 1]);
  assert.equal(thin(pts, 0, 50).length, 50);

  const dogs = [{ id: "a", name: "Belle" }, { id: "b", name: "Jake" }] as DogRow[];
  assert.equal(matchDog("Belle", dogs)?.id, "a");
  assert.equal(matchDog("JAKE & co", dogs)?.id, "b");
  assert.equal(matchDog("Track 3", dogs), undefined);

  assert.deepEqual(positionAt(pts, T0 + 101), pts[40]);
  assert.equal(positionAt(pts, T0 - 600), null);
  assert.equal(formatDuration(5400), "1h 30m");
});
