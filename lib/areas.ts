// Turning a property's parcels and courses into map outlines.
import type { MapArea } from "@/components/MapView";
import { shapeAcres, totalAcres } from "@/lib/geo";
import type { CourseRow, PropertyRow } from "@/types/database";

/** Visible on satellite and topo, and distinct from covey orange / contact blue. */
export const COURSE_COLORS = ["#ffe066", "#7ee8a1", "#f78fb3", "#c3a6ff", "#63e6e2", "#ffb86b", "#b5e48c", "#e9ecef"];
export const PROPERTY_COLOR = "#ffffff";

export function courseColor(courses: CourseRow[], id: string): string {
  const i = courses.findIndex((c) => c.id === id);
  return COURSE_COLORS[(i < 0 ? 0 : i) % COURSE_COLORS.length];
}

export function formatAcres(a: number): string {
  return a >= 100 ? `${Math.round(a).toLocaleString()} ac` : `${a.toFixed(1)} ac`;
}

export function propertyAreas(property: PropertyRow, courses: CourseRow[]): MapArea[] {
  const out: MapArea[] = [];
  if (property.boundary?.length)
    out.push({ id: `property:${property.id}`, label: property.name, color: PROPERTY_COLOR, shapes: property.boundary, kind: "property" });
  for (const c of courses)
    if (c.boundary?.length)
      out.push({
        id: `course:${c.id}`,
        label: `${c.name} · ${formatAcres(totalAcres(c.boundary))}`,
        color: courseColor(courses, c.id),
        shapes: c.boundary,
        kind: "course",
      });
  return out;
}

export { shapeAcres, totalAcres };
