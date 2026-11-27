// Seasons run August through July: a hunt on 2026-01-15 belongs to "2025-2026".

export function seasonForDate(input: Date | string = new Date()): string {
  const d = typeof input === "string" ? parseLocalDate(input) : input;
  const y = d.getFullYear();
  const start = d.getMonth() >= 7 ? y : y - 1; // getMonth: 7 = August
  return `${start}-${start + 1}`;
}

export function currentSeason(): string {
  return seasonForDate(new Date());
}

/** Sorted newest first, always including the current season. */
export function seasonList(seasons: Iterable<string | null | undefined>): string[] {
  const set = new Set<string>([currentSeason()]);
  for (const s of seasons) if (s) set.add(s);
  return [...set].sort().reverse();
}

/** Parse "YYYY-MM-DD" as a local date (new Date("YYYY-MM-DD") is UTC midnight). */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO(): string {
  return localDateISO(new Date());
}

/** YYYY-MM-DD in the device's local time zone. */
export function localDateISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDate(s: string): string {
  return parseLocalDate(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
