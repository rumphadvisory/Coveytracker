// Active Field Mode session, persisted in localStorage so a reload, a dead
// screen or a dropped tab doesn't lose an in-progress hunt. Marks themselves
// are written to Supabase immediately on tap; this only tracks which ones
// belong to the session.

export interface SessionMark {
  id: string;
  type: "covey" | "contact";
  dogId: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: string;
}

export interface FieldSession {
  propertyId: string;
  courseId: string;
  startedAt: string;
  endedAt?: string;
  season: string;
  weather?: { weather: string; temperature: string; wind: string; barometric_pressure: string };
  marks: SessionMark[];
}

const key = (propertyId: string) => `ct:field:${propertyId}`;

export function loadSession(propertyId: string): FieldSession | null {
  try {
    const raw = localStorage.getItem(key(propertyId));
    return raw ? (JSON.parse(raw) as FieldSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: FieldSession) {
  try {
    localStorage.setItem(key(s.propertyId), JSON.stringify(s));
  } catch {}
}

export function clearSession(propertyId: string) {
  try {
    localStorage.removeItem(key(propertyId));
  } catch {}
}

/** Elapsed hours rounded to the nearest quarter hour (min 0.25). */
export function sessionHours(s: FieldSession): number {
  const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
  const h = (end - new Date(s.startedAt).getTime()) / 3_600_000;
  return Math.max(0.25, Math.round(h * 4) / 4);
}

export function contactsByDog(s: FieldSession): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of s.marks) if (m.type === "contact" && m.dogId) out[m.dogId] = (out[m.dogId] ?? 0) + 1;
  return out;
}
