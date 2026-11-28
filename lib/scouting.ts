// Scouting: covey locations and habitat notes recorded without a hunt, dog or course, and the
// development plan built from them (hotspots to build courses around, gaps still to scout,
// habitat work by type). Pure functions so they can be unit tested.
import { containsPoint, shapesBounds, totalAcres, type BoundaryShape } from "./geo.ts";
import { haversine } from "./tracks.ts";
import type { GpsMarkRow } from "../types/database";

export type CoveyHow = "seen" | "heard" | "flushed";

export const COVEY_HOW: { id: CoveyHow; label: string; icon: string }[] = [
  { id: "seen", label: "Seen", icon: "visibility" },
  { id: "heard", label: "Heard", icon: "hearing" },
  { id: "flushed", label: "Flushed", icon: "air" },
];

/** Quick picks for "about how many birds" (null = not sure). */
export const COVEY_SIZES: (number | null)[] = [null, 6, 10, 14, 18, 25];

export type NoteCategory =
  | "cover"
  | "brood"
  | "food"
  | "burn"
  | "hardwood"
  | "predator"
  | "feed"
  | "water"
  | "access"
  | "other";

export interface CategoryInfo {
  label: string;
  icon: string;
  color: string;
  /** What to do about it, used in the plan. */
  action: string;
}

export const NOTE_CATEGORIES: Record<NoteCategory, CategoryInfo> = {
  cover: {
    label: "Good cover",
    icon: "forest",
    color: "#2f7d3a",
    action: "Protect it: escape and loafing cover near feeding areas. Don't burn or mow all of it in the same year.",
  },
  brood: {
    label: "Brood habitat",
    icon: "grass",
    color: "#93a32b",
    action: "Keep it open and weedy (bare ground, forbs, insects) with frequent burning or light disking.",
  },
  food: {
    label: "Food / plot site",
    icon: "agriculture",
    color: "#d4a514",
    action: "Candidate for food plots or disked strips. Check soil, sun and equipment access.",
  },
  burn: {
    label: "Needs burning",
    icon: "local_fire_department",
    color: "#d0452f",
    action: "Add to the burn plan. Many plantations burn about half the uplands each year in a patchwork.",
  },
  hardwood: {
    label: "Hardwood / brush",
    icon: "park",
    color: "#7a5a32",
    action: "Thin or remove encroaching hardwoods and brush to open the canopy and bring back groundcover.",
  },
  predator: {
    label: "Predator sign",
    icon: "pest_control",
    color: "#8a3aa0",
    action: "Plan nest-predator trapping ahead of nesting season (roughly March through June).",
  },
  feed: {
    label: "Feed line site",
    icon: "grain",
    color: "#c06a1f",
    action: "Candidate route for a supplemental feed line; tie it to cover and course routing.",
  },
  water: {
    label: "Water",
    icon: "water_drop",
    color: "#2a7fb8",
    action: "Use for course routing and dog water stops.",
  },
  access: {
    label: "Road / gate / trail",
    icon: "alt_route",
    color: "#5b5b5b",
    action: "Use for course routing, wagon or truck access and firebreaks.",
  },
  other: { label: "Other note", icon: "edit_note", color: "#7c7c7c", action: "Review on the next visit." },
};

export const NOTE_ORDER = Object.keys(NOTE_CATEGORIES) as NoteCategory[];

export function isNoteCategory(c: string | null | undefined): c is NoteCategory {
  return !!c && c in NOTE_CATEGORIES;
}

export function howLabel(c: string | null | undefined): string | null {
  return COVEY_HOW.find((h) => h.id === c)?.label ?? null;
}

/** Title for a mark recorded in Scout (or any covey mark). */
export function scoutTitle(m: Pick<GpsMarkRow, "type" | "category">): string {
  if (m.type === "scout") return isNoteCategory(m.category) ? NOTE_CATEGORIES[m.category].label : "Note";
  const how = howLabel(m.category);
  return how ? `Covey · ${how.toLowerCase()}` : "Covey";
}

/** Rough compass direction of a point from a center ("north", "southeast", …). */
export function direction(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const dy = to.lat - from.lat;
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  if (Math.hypot(dx, dy) < 0.0015) return "center";
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const names = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return names[Math.round(((deg + 360) % 360) / 45) % 8];
}

export interface Hotspot {
  n: number;
  lat: number;
  lng: number;
  /** Distance from the center to the farthest covey in it. */
  radiusM: number;
  birds: number | null;
  where: string;
  /** Name of a course outline it already falls in, if any. */
  course: string | null;
}

/**
 * Group coveys that are within `linkM` of each other (single linkage). Groups of two or more are
 * hotspots, largest first; lone coveys are counted separately.
 */
export function findHotspots(
  coveys: Pick<GpsMarkRow, "lat" | "lng" | "birds">[],
  center: { lat: number; lng: number },
  courses: { name: string; boundary: BoundaryShape[] | null }[] = [],
  linkM = 400,
): { hotspots: Hotspot[]; lone: number } {
  const parent = coveys.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < coveys.length; i++)
    for (let j = i + 1; j < coveys.length; j++)
      if (haversine([coveys[i].lng, coveys[i].lat], [coveys[j].lng, coveys[j].lat]) <= linkM) parent[find(i)] = find(j);
  const groups = new Map<number, typeof coveys>();
  coveys.forEach((c, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), c]));
  const hotspots: Hotspot[] = [];
  let lone = 0;
  for (const g of groups.values()) {
    if (g.length < 2) {
      lone += g.length;
      continue;
    }
    const lat = g.reduce((a, c) => a + c.lat, 0) / g.length;
    const lng = g.reduce((a, c) => a + c.lng, 0) / g.length;
    const sized = g.filter((c) => c.birds != null);
    hotspots.push({
      n: g.length,
      lat,
      lng,
      radiusM: Math.max(...g.map((c) => haversine([lng, lat], [c.lng, c.lat]))),
      birds: sized.length ? sized.reduce((a, c) => a + (c.birds ?? 0), 0) : null,
      where: direction(center, { lat, lng }),
      course: courses.find((c) => containsPoint(c.boundary, lat, lng))?.name ?? null,
    });
  }
  hotspots.sort((a, b) => b.n - a.n);
  return { hotspots, lone };
}

/**
 * Share of the property more than `reachM` from anything recorded (covey or note): the parts
 * nobody has scouted yet, or that had nothing worth noting. Sampled on a ~100 m grid.
 */
export function unscoutedShare(
  boundary: BoundaryShape[] | null | undefined,
  points: { lat: number; lng: number }[],
  reachM = 400,
): number | null {
  const b = shapesBounds(boundary);
  if (!b) return null;
  const stepLat = 100 / 111_320;
  const stepLng = 100 / (111_320 * Math.cos((((b.south + b.north) / 2) * Math.PI) / 180));
  let inside = 0;
  let far = 0;
  // Cap the grid so huge properties stay quick.
  const rows = Math.ceil((b.north - b.south) / stepLat);
  const cols = Math.ceil((b.east - b.west) / stepLng);
  const skip = Math.max(1, Math.ceil(Math.sqrt((rows * cols) / 6000)));
  for (let r = 0; r <= rows; r += skip)
    for (let c = 0; c <= cols; c += skip) {
      const lat = b.south + (r + 0.5) * stepLat;
      const lng = b.west + (c + 0.5) * stepLng;
      if (!containsPoint(boundary, lat, lng)) continue;
      inside++;
      if (!points.some((p) => haversine([lng, lat], [p.lng, p.lat]) <= reachM)) far++;
    }
  return inside ? far / inside : null;
}

export interface PlanInput {
  coveys: GpsMarkRow[]; // every covey mark on the property (scouting and hunts)
  notes: GpsMarkRow[]; // type "scout"
  boundary: BoundaryShape[] | null;
  center: { lat: number; lng: number };
  courses: { name: string; boundary: BoundaryShape[] | null }[];
}

export interface HabitatGroup {
  category: NoteCategory;
  info: CategoryInfo;
  count: number;
  notes: string[];
}

export interface ScoutPlan {
  coveys: number;
  byHow: Record<CoveyHow | "other", number>;
  birdsCounted: number | null;
  acres: number | null;
  acresPerCovey: number | null;
  hotspots: Hotspot[];
  lone: number;
  unscouted: number | null;
  habitat: HabitatGroup[];
  steps: { text: string; href?: string }[];
}

const round = (x: number) => Math.round(x);

export function scoutingPlan({ coveys, notes, boundary, center, courses }: PlanInput): ScoutPlan {
  const byHow: ScoutPlan["byHow"] = { seen: 0, heard: 0, flushed: 0, other: 0 };
  for (const c of coveys) byHow[(howLabel(c.category) ? c.category : "other") as CoveyHow | "other"]++;
  const sized = coveys.filter((c) => c.birds != null);
  const acres = boundary?.length ? totalAcres(boundary) : null;
  const { hotspots, lone } = findHotspots(coveys, center, courses);
  const unscouted = unscoutedShare(boundary, [...coveys, ...notes]);

  const habitat: HabitatGroup[] = NOTE_ORDER.map((category) => {
    const items = notes.filter((n) => (isNoteCategory(n.category) ? n.category : "other") === category);
    return {
      category,
      info: NOTE_CATEGORIES[category],
      count: items.length,
      notes: items.map((n) => n.notes?.trim()).filter((x): x is string => !!x),
    };
  }).filter((g) => g.count > 0);

  const steps: ScoutPlan["steps"] = [];
  if (!boundary?.length)
    steps.push({ text: "Outline the property so acreage, density and unscouted ground can be worked out.", href: "/boundaries" });
  if (unscouted != null && unscouted > 0.25)
    steps.push({
      text: `About ${round(unscouted * 100)}% of the property has nothing recorded within a quarter mile. Scout those areas before laying out courses.`,
    });
  const unrouted = hotspots.filter((h) => !h.course);
  if (unrouted.length)
    steps.push({
      text: `Lay out courses that link the covey hotspots (${unrouted
        .slice(0, 3)
        .map((h) => `${h.n} coveys ${h.where === "center" ? "in the center" : `in the ${h.where}`}`)
        .join("; ")}), then draw them on the Boundaries page.`,
      href: "/boundaries",
    });
  else if (!hotspots.length && coveys.length < 4)
    steps.push({ text: "Keep scouting: a few more covey locations will show where the birds concentrate." });
  steps.push({
    text: "Run fall covey counts (listen at dawn in October–November) from points near the hotspots to set a population baseline.",
    href: "/counts",
  });
  const work = habitat.filter((g) => g.category !== "other" && g.category !== "water" && g.category !== "access");
  if (work.length)
    steps.push({
      text: `Work through the habitat list: ${work.map((g) => `${g.info.label.toLowerCase()} (${g.count})`).join(", ")}. Burns and predator control are time-sensitive, so schedule those first.`,
    });
  steps.push({ text: "Re-scout next fall and compare: more coveys and fewer gaps mean the work is paying off." });

  return {
    coveys: coveys.length,
    byHow,
    birdsCounted: sized.length ? sized.reduce((a, c) => a + (c.birds ?? 0), 0) : null,
    acres: acres ? round(acres) : null,
    acresPerCovey: acres && coveys.length ? acres / coveys.length : null,
    hotspots,
    lone,
    unscouted,
    habitat,
    steps,
  };
}

/** Plain-text version of the plan, for pasting into an email or notes. */
export function planText(propertyName: string, plan: ScoutPlan, date = new Date()): string {
  const lines = [`${propertyName}: scouting and development plan (${date.toLocaleDateString()})`, ""];
  lines.push(
    `Coveys located: ${plan.coveys} (seen ${plan.byHow.seen}, heard ${plan.byHow.heard}, flushed ${plan.byHow.flushed}${
      plan.byHow.other ? `, from hunts ${plan.byHow.other}` : ""
    })`,
  );
  if (plan.birdsCounted) lines.push(`Birds estimated on sized coveys: ${plan.birdsCounted}`);
  if (plan.acres) lines.push(`Property: ${plan.acres} acres${plan.acresPerCovey ? `, 1 covey found per ${round(plan.acresPerCovey)} acres` : ""}`);
  if (plan.unscouted != null) lines.push(`Unscouted (nothing recorded within 1/4 mile): ${round(plan.unscouted * 100)}%`);
  if (plan.hotspots.length) {
    lines.push("", "Covey hotspots:");
    plan.hotspots.forEach((h, i) =>
      lines.push(`  ${i + 1}. ${h.n} coveys, ${h.where === "center" ? "center" : h.where} of property${h.course ? ` (in ${h.course})` : ""}`),
    );
  }
  if (plan.habitat.length) {
    lines.push("", "Habitat notes:");
    for (const g of plan.habitat) {
      lines.push(`  ${g.info.label}: ${g.count}`);
      for (const n of g.notes) lines.push(`    - ${n}`);
    }
  }
  lines.push("", "Next steps:");
  plan.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.text}`));
  return lines.join("\n");
}
