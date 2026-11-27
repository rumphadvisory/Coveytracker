"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient, type Supabase } from "@/lib/supabase/client";
import type { CourseRow, DogRow, PropertyRow, Role } from "@/types/database";

const STORAGE_KEY = "ct:propertyId";

export interface Membership {
  role: Role;
  property: PropertyRow;
}

interface Ctx {
  sb: Supabase;
  user: User;
  memberships: Membership[];
  property: PropertyRow;
  role: Role;
  canManage: boolean;
  isOwner: boolean;
  dogs: DogRow[];
  activeDogs: DogRow[];
  courses: CourseRow[];
  courseName: (id: string | null | undefined) => string;
  dogName: (id: string | null | undefined) => string;
  switchProperty: (id: string) => void;
  reloadRoster: () => Promise<void>;
  reloadMemberships: () => Promise<void>;
}

const PropertyContext = createContext<Ctx | null>(null);

export function useProperty(): Ctx {
  const ctx = useContext(PropertyContext);
  if (!ctx) throw new Error("useProperty must be used inside <PropertyProvider>");
  return ctx;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function PropertyProvider({ children }: { children: React.ReactNode }) {
  const sb = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [dogs, setDogs] = useState<DogRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reloadMemberships = useCallback(async () => {
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) {
      router.replace("/");
      return;
    }
    setUser(auth.user);
    await sb.rpc("accept_pending_invites");
    const { data, error } = await sb
      .from("property_members")
      .select("role, property:properties(*)")
      .eq("user_id", auth.user.id)
      .order("created_at");
    if (error) {
      setError(error.message);
      return;
    }
    const list = ((data ?? []) as unknown as { role: Role; property: PropertyRow | null }[])
      .filter((m): m is Membership => m.property != null);
    if (list.length === 0) {
      router.replace("/onboarding");
      return;
    }
    setMemberships(list);
    const stored = readStored();
    setPropertyId((cur) => {
      const want = cur ?? stored;
      return list.some((m) => m.property.id === want) ? want : list[0].property.id;
    });
  }, [sb, router]);

  const reloadRoster = useCallback(async () => {
    if (!propertyId) return;
    const [d, c] = await Promise.all([
      sb.from("dogs").select("*").eq("property_id", propertyId).order("name"),
      sb.from("courses").select("*").eq("property_id", propertyId).order("name"),
    ]);
    setDogs(d.data ?? []);
    setCourses(c.data ?? []);
  }, [sb, propertyId]);

  useEffect(() => {
    reloadMemberships();
  }, [reloadMemberships]);

  useEffect(() => {
    reloadRoster();
  }, [reloadRoster]);

  const switchProperty = useCallback((id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
    setDogs([]);
    setCourses([]);
    setPropertyId(id);
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!user || !memberships || !propertyId) return null;
    const m = memberships.find((x) => x.property.id === propertyId);
    if (!m) return null;
    const courseMap = new Map(courses.map((c) => [c.id, c.name]));
    const dogMap = new Map(dogs.map((d) => [d.id, d.name]));
    return {
      sb,
      user,
      memberships,
      property: m.property,
      role: m.role,
      canManage: m.role === "owner" || m.role === "manager",
      isOwner: m.role === "owner",
      dogs,
      activeDogs: dogs.filter((d) => d.active),
      courses,
      courseName: (id) => (id ? courseMap.get(id) ?? "Unknown course" : "No course"),
      dogName: (id) => (id ? dogMap.get(id) ?? "Unknown dog" : "—"),
      switchProperty,
      reloadRoster,
      reloadMemberships,
    };
  }, [sb, user, memberships, propertyId, dogs, courses, switchProperty, reloadRoster, reloadMemberships]);

  if (error) {
    return <div className="p-6 text-red-700">Couldn&apos;t load your properties: {error}</div>;
  }
  if (!value) {
    return (
      <div className="flex min-h-screen items-center justify-center text-bark">
        <span className="material-symbols-outlined mr-2 animate-spin">progress_activity</span> Loading…
      </div>
    );
  }
  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}
