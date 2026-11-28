// Sample plantation for the public demo (/demo). Entirely made up and generated in the
// browser from a fixed seed, so every visitor sees the same believable data and nothing
// touches the real database.
import { totalAcres } from "./geo";
import { currentSeason } from "./seasons";
import type { BoundaryShape, CoveyCountRow, CourseRow, DogRow, GpsMarkRow, HuntWithRuns, LngLat, PropertyRow } from "@/types/database";
import type { Conditions } from "./weather";

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CENTER = { lat: 30.962, lng: -84.118 };
const P = "demo-property";

function rect(name: string, west: number, south: number, east: number, north: number): BoundaryShape {
  const ring: LngLat[] = [
    [CENTER.lng + west, CENTER.lat + south],
    [CENTER.lng + east, CENTER.lat + south],
    [CENTER.lng + east, CENTER.lat + north],
    [CENTER.lng + west, CENTER.lat + north],
  ];
  return { name, rings: [ring] };
}

const COURSE_SHAPES: [string, BoundaryShape][] = [
  ["Big Woods", rect("Big Woods", -0.021, 0.002, -0.004, 0.016)],
  ["Pond Field", rect("Pond Field", 0.002, 0.003, 0.019, 0.015)],
  ["Wiregrass", rect("Wiregrass", -0.02, -0.015, -0.003, -0.002)],
  ["Hickory Head", rect("Hickory Head", 0.003, -0.016, 0.02, -0.003)],
];

export interface DemoData {
  property: PropertyRow;
  courses: CourseRow[];
  dogs: DogRow[];
  hunts: HuntWithRuns[];
  marks: GpsMarkRow[];
  counts: CoveyCountRow[];
  conditions: Conditions;
  season: string;
  lastSeason: string;
}

function pointIn(shape: BoundaryShape, r: () => number): [number, number] {
  const ring = shape.rings[0];
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const lng = Math.min(...lngs) + r() * (Math.max(...lngs) - Math.min(...lngs));
  const lat = Math.min(...lats) + r() * (Math.max(...lats) - Math.min(...lats));
  return [lat, lng];
}

export function buildDemo(): DemoData {
  const r = rng(20261128);
  const season = currentSeason();
  const startYear = Number(season.slice(0, 4));
  const lastSeason = `${startYear - 1}-${startYear}`;

  const property: PropertyRow = {
    id: P,
    name: "Magnolia Bend Plantation",
    lat: CENTER.lat,
    lng: CENTER.lng,
    boundary: [rect("Magnolia Bend", -0.024, -0.019, 0.023, 0.019)],
    owner_id: "demo",
    created_at: "",
  };
  const courses: CourseRow[] = COURSE_SHAPES.map(([name, shape], i) => ({
    id: `c${i}`,
    property_id: P,
    name,
    acres: Math.round(totalAcres([shape])),
    boundary: [shape],
    created_at: "",
  }));
  // Some courses are simply better: weight coveys per hour by course.
  const courseQuality = [1.25, 0.95, 1.1, 0.8];
  const dogs: DogRow[] = ["Belle", "Jake", "Scout", "Dixie", "Rebel"].map((name, i) => ({
    id: `d${i}`,
    property_id: P,
    name,
    active: i < 5,
    created_at: "",
  }));
  const dogSkill = [1.3, 1.0, 1.15, 0.85, 0.95];

  const hunts: HuntWithRuns[] = [];
  const marks: GpsMarkRow[] = [];
  const weather = ["Clear", "Partly Cloudy", "Overcast", "Mainly Clear", "Foggy"];
  const ground = ["Damp", "Dry", "Frost", "Damp", "Wet"];

  const makeSeason = (s: string, year: number, n: number, quality: number) => {
    for (let i = 0; i < n; i++) {
      // Hunting days from mid-November through February.
      const day = new Date(year, 10, 15 + Math.floor((i / n) * 100) + Math.floor(r() * 3));
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const ci = Math.floor(r() * courses.length);
      const course = courses[ci];
      const hours = [2.5, 3, 3, 3.5, 4][Math.floor(r() * 5)];
      const rate = (1.2 + r() * 0.9) * courseQuality[ci] * quality; // coveys per hour
      const seen = Math.max(1, Math.round(rate * hours));
      const wild = Math.round(seen * (0.15 + r() * 0.2));
      const pointed = seen - wild;
      const shot = Math.max(0, Math.round(pointed * (0.45 + r() * 0.3)));
      const cocks = Math.round(shot * (1.1 + r() * 0.8));
      const hens = Math.round(shot * (0.9 + r() * 0.7));
      const juvenile = Math.round((cocks + hens) * (0.55 + r() * 0.5));
      const id = `${s}-h${i}`;
      const pair = [Math.floor(r() * 5), Math.floor(r() * 5)];
      if (pair[1] === pair[0]) pair[1] = (pair[0] + 1) % 5;
      const dog_runs = pair.map((d, k) => {
        const contacts = Math.max(0, Math.round((pointed / 2) * dogSkill[d] * (0.7 + r() * 0.6)));
        return { id: `${id}-r${k}`, hunt_id: id, dog_id: dogs[d].id, contacts, hours: hours / 2 };
      });
      hunts.push({
        id,
        property_id: P,
        date,
        season: s,
        course_id: course.id,
        hours_spent: hours,
        weather: weather[Math.floor(r() * weather.length)],
        temperature: `${Math.round(38 + r() * 22)}°F`,
        wind: `${["N", "NW", "W", "SW", "S", "NE"][Math.floor(r() * 6)]} ${Math.round(2 + r() * 10)} mph`,
        ground: ground[Math.floor(r() * ground.length)],
        barometric_pressure: `${(29.85 + r() * 0.45).toFixed(2)} inHg`,
        comments: i % 7 === 0 ? "Birds holding tight along the creek edge." : null,
        coveys_pointed: pointed,
        coveys_shot: shot,
        coveys_flushed: Math.round(r() * 2),
        coveys_flushed_wild: wild,
        total_coveys_seen: pointed + wild,
        birds_on_covey_rise: Math.round(seen * (9 + r() * 5)),
        singles_shot: Math.round(r() * 3),
        total_birds_cocks: cocks,
        total_birds_hens: hens,
        total_birds_adult: cocks + hens,
        total_birds_juvenile: juvenile,
        total_contacts: dog_runs.reduce((a, x) => a + x.contacts, 0),
        created_by: "demo",
        created_at: date,
        dog_runs,
      });
      if (s === season) {
        const shape = course.boundary![0];
        for (let k = 0; k < seen; k++) {
          const [lat, lng] = pointIn(shape, r);
          marks.push({ id: `${id}-m${k}`, property_id: P, hunt_id: id, type: "covey", lat, lng, accuracy: 6, dog_id: null, course_id: course.id, season: s, timestamp: `${date}T${String(8 + k).padStart(2, "0")}:15:00`, notes: null, created_by: "demo" });
        }
        for (const run of dog_runs)
          for (let k = 0; k < Math.min(run.contacts, 4); k++) {
            const [lat, lng] = pointIn(shape, r);
            marks.push({ id: `${run.id}-m${k}`, property_id: P, hunt_id: id, type: "contact", lat, lng, accuracy: 7, dog_id: run.dog_id, course_id: course.id, season: s, timestamp: `${date}T${String(9 + k).padStart(2, "0")}:40:00`, notes: null, created_by: "demo" });
          }
      }
    }
  };
  makeSeason(lastSeason, startYear - 1, 22, 0.92);
  makeSeason(season, startYear, 16, 1);
  hunts.sort((a, b) => b.date.localeCompare(a.date));

  const counts: CoveyCountRow[] = courses.map((c, i) => {
    const [lat, lng] = pointIn(c.boundary![0], r);
    const heard = [11, 8, 10, 7][i];
    return {
      id: `k${i}`,
      property_id: P,
      date: `${startYear}-10-${18 + i}`,
      season,
      course_id: c.id,
      coveys_heard: heard,
      avg_covey_size: 12,
      acres_surveyed: 280,
      estimated_birds: heard * 12,
      lat,
      lng,
      notes: null,
      created_by: "demo",
      created_at: "",
    };
  });

  const conditions: Conditions = {
    temperature: 47,
    feelsLike: 44,
    humidity: 74,
    dewPoint: 39,
    pressure: 30.14,
    windSpeed: 5,
    windDirection: 315,
    windGusts: 9,
    weatherCode: 2,
    description: "Partly Cloudy",
    fetchedAt: new Date().toISOString(),
  };

  return { property, courses, dogs, hunts, marks, counts, conditions, season, lastSeason };
}
