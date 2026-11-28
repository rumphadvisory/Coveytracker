// Hand-maintained to match supabase/migrations. Regenerate with `npm run db:types`
// once a Supabase project exists (then keep the convenience aliases at the bottom).

export type Role = "owner" | "manager" | "handler";

/** [longitude, latitude] — GeoJSON order. */
export type LngLat = [number, number];
/** A named area: first ring is the outline, any further rings are holes. */
export type BoundaryShape = { name: string; rings: LngLat[][] };
/** covey / contact from hunts and scouting; scout = a habitat or property note from Scout. */
export type MarkType = "covey" | "contact" | "scout";

// Generated = `generated always` columns, which can't be written. Columns with defaults
// (id, created_at, …) stay optional on Insert.
type Table<Row, Required extends keyof Row, Generated extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export type PropertyRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  /** Parcels making up the property (null until outlined). */
  boundary: BoundaryShape[] | null;
  owner_id: string;
  created_at: string;
}

export type PropertyMemberRow = {
  id: string;
  property_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

export type PropertyInviteRow = {
  id: string;
  property_id: string;
  email: string;
  role: Exclude<Role, "owner">;
  invited_by: string | null;
  created_at: string;
}

export type DogRow = {
  id: string;
  property_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export type CourseRow = {
  id: string;
  property_id: string;
  name: string;
  acres: number | null;
  /** Course outline (usually one area; null until outlined). */
  boundary: BoundaryShape[] | null;
  created_at: string;
}

export type HuntRow = {
  id: string;
  property_id: string;
  date: string;
  season: string;
  course_id: string | null;
  hours_spent: number | null;
  weather: string | null;
  temperature: string | null;
  wind: string | null;
  ground: string | null;
  barometric_pressure: string | null;
  comments: string | null;
  coveys_pointed: number;
  coveys_shot: number;
  coveys_flushed: number;
  coveys_flushed_wild: number;
  total_coveys_seen: number;
  birds_on_covey_rise: number;
  singles_shot: number;
  total_birds_cocks: number;
  total_birds_hens: number;
  total_birds_adult: number;
  total_birds_juvenile: number;
  total_contacts: number;
  created_by: string | null;
  created_at: string;
}

export type DogRunRow = {
  id: string;
  hunt_id: string;
  dog_id: string;
  contacts: number;
  hours: number | null;
}

export type GpsMarkRow = {
  id: string;
  property_id: string;
  hunt_id: string | null;
  type: MarkType;
  lat: number;
  lng: number;
  accuracy: number | null;
  dog_id: string | null;
  course_id: string | null;
  season: string;
  timestamp: string;
  notes: string | null;
  created_by: string | null;
  /** Scout: how a covey was found (seen/heard/flushed) or the note's category (lib/scouting.ts). */
  category?: string | null;
  /** Scout: rough covey size, if counted. */
  birds?: number | null;
}

export type CoveyCountRow = {
  id: string;
  property_id: string;
  date: string;
  season: string;
  course_id: string | null;
  coveys_heard: number;
  avg_covey_size: number;
  acres_surveyed: number | null;
  estimated_birds: number;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** [longitude, latitude, unix seconds] */
export type TrackPoint = [number, number, number];

export type DogTrackRow = {
  id: string;
  property_id: string;
  hunt_id: string;
  dog_id: string | null;
  name: string;
  points: TrackPoint[];
  distance_m: number;
  duration_s: number;
  moving_s: number;
  started_at: string | null;
  ended_at: string | null;
  created_by: string | null;
  created_at: string;
}

export type WaitlistRole = "owner" | "manager" | "dog_man" | "other";

export type WaitlistRow = {
  id: string;
  name: string;
  email: string;
  property_name: string | null;
  state: string | null;
  acres: string | null;
  role: WaitlistRole | null;
  heard_from: string | null;
  created_at: string;
}

export type MemberListRow = {
  id: string;
  user_id: string;
  email: string;
  role: Role;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      properties: Table<PropertyRow, "name">;
      property_members: Table<PropertyMemberRow, "property_id" | "user_id" | "role">;
      property_invites: Table<PropertyInviteRow, "property_id" | "email" | "role">;
      dogs: Table<DogRow, "property_id" | "name">;
      courses: Table<CourseRow, "property_id" | "name">;
      hunts: Table<
        HuntRow,
        "property_id" | "season",
        "total_coveys_seen" | "total_birds_adult" | "total_contacts"
      >;
      dog_runs: Table<DogRunRow, "hunt_id" | "dog_id">;
      gps_marks: Table<GpsMarkRow, "property_id" | "type" | "lat" | "lng" | "season">;
      covey_counts: Table<CoveyCountRow, "property_id" | "season", "estimated_birds">;
      waitlist: Table<WaitlistRow, "name" | "email">;
      dog_tracks: Table<DogTrackRow, "property_id" | "hunt_id" | "points">;
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_pending_invites: { Args: Record<PropertyKey, never>; Returns: number };
      property_member_list: { Args: { p_property: string }; Returns: MemberListRow[] };
      clear_hunt_data: { Args: { p_property: string }; Returns: undefined };
      member_role: { Args: { p_property: string }; Returns: string | null };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

/** A hunt with its dog runs joined (as selected by lib/data.ts). */
export type HuntWithRuns = HuntRow & { dog_runs: DogRunRow[] };
