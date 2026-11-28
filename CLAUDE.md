# CoveyTracker

Quail plantation hunting management SaaS. GPS covey mapping, dog performance analytics, weather integration, harvest budget tracking.

## Stack
- Next.js 14 (App Router) + Tailwind CSS + TypeScript
- Supabase (Postgres, Auth, Realtime, RLS) via `@supabase/ssr`
- Leaflet.js maps: Esri satellite, hybrid (satellite + roads/labels) and USGS topo basemaps
- Open-Meteo API for weather (no key needed)
- Vercel for hosting

## Project Structure
```
app/
  layout.tsx            # Root layout, fonts (Libre Baskerville / DM Sans), Material Symbols
  page.tsx              # Public home page: overview, features, waitlist form, "Beta sign-in"
  login/page.tsx        # Magic-link / code sign-in (signed-in users are sent to /field)
  demo/page.tsx         # Public guided tour on sample data (lib/demoData.ts): 8 steps ending in season decisions
  robots.ts             # Private beta: disallow all crawlers (root layout also sets noindex)
  auth/callback/        # Magic link + token_hash exchange
  auth/signout/         # POST sign out
  onboarding/page.tsx   # Create property → courses/dogs → invite team
  (app)/
    layout.tsx          # PropertyProvider + Nav (auth required)
    field/page.tsx      # Field Mode (GPS marking)
    log/page.tsx        # Hunt logger wizard (?from=field pre-fills from the field session)
    hunts/page.tsx      # Hunt list with filters (each links to /hunt?id=…)
    hunt/page.tsx       # One hunt: map (course, marks, Garmin dog tracks), summary, dogs vs season, timeline, GPX upload
    dogs/page.tsx       # Dog performance
    courses/page.tsx    # Course stats
    weather/page.tsx    # Weather dashboard + scenting + hunt advisor
    map/page.tsx        # Leaflet satellite map (realtime marks)
    counts/page.tsx     # Fall covey count surveys
    harvest/page.tsx    # Harvest budget calculator
    season/page.tsx     # Season dashboard
    boundaries/page.tsx # Property parcels + course outlines: upload KML/KMZ/GPX/GeoJSON, paste points, draw
    manage/page.tsx     # Dogs, courses, property, team, danger zone
components/
  PropertyProvider.tsx  # Current user/property/role/dogs/courses context (useProperty)
  Nav.tsx               # Top nav (desktop) + bottom bar & "More" sheet (mobile)
  HuntWizard.tsx        # 5-step hunt form
  MapView.tsx           # Leaflet wrapper (client-only; load with next/dynamic ssr:false)
  QueueSync.tsx         # Background uploads of the outbox + offline/pending status strip (useOutbox)
  useCachedQuery.ts     # Cached-first data hook (IndexedDB copy, then server); useHunts/useCounts/useMarks build on it
  OfflineMaps.tsx       # "Save maps for offline" panel on the Map page
  ServiceWorker.tsx     # Registers public/sw.js (production only) and pre-caches field pages
  DogChipGrid, WeatherCard, ScentingBadge, HarvestGauge, StatBox, ui.tsx (shared bits)
lib/
  supabase/{client,server,middleware}.ts
  data.ts               # Query helpers
  weather.ts            # Open-Meteo fetch + scenting model + pressure note
  stats.ts              # Aggregations (totals, rates, dog/course stats, advisor)
  harvest.ts            # Harvest budget model
  seasons.ts            # Season helpers (Aug–Jul)
  gps.ts                # Geolocation wrapper
  fieldSession.ts       # Active Field Mode session in localStorage
  outbox.ts             # Offline-first ordered write queue (marks, hunts, dog runs, counts), idempotent
  cache.ts              # IndexedDB copies of server data for offline reads
  tiles.ts              # Tile math + saveable USGS basemaps; offlineMaps.ts downloads them
  geo.ts                # Boundary parsers (KML/GPX/GeoJSON/point lists), acres, point-in-area, bounds
  boundaryFiles.ts      # Browser file loading for boundaries (unzips KMZ with fflate)
  areas.ts              # Property/course outlines → map areas (colors, acre labels)
  coords.ts             # Lat/lng parsing (decimal, N/S/E/W, DMS, pasted pairs)
  tracks.ts             # Garmin/GPX dog tracks: parse, trim to hunt date, thin, stats, match dog, position at time
  insights.ts           # Season → management decisions (best course, harvest pressure, trend, reproduction, dogs, hunt quality)
  demoData.ts           # Seeded sample plantation for /demo
public/sw.js            # Service worker: network-first pages, cache-first static assets/fonts, saved USGS tiles
public/manifest.json    # PWA manifest (start_url /field) + icon-*.png
types/database.ts       # DB types (hand-maintained; keep as `type`, not `interface`)
supabase/migrations/    # SQL schema, triggers, RPCs, RLS
tests/                  # node:test unit tests for lib/ logic
```

## Key Conventions
- Mobile-first design. All pages must work at 400px width.
- Fonts: Libre Baskerville (display), DM Sans (body). Icons: Material Symbols Outlined.
- Color palette: forest green accent (#3d6e38), earthy neutrals (see tailwind.config.ts)
- Covey marks: orange (#e76624). Dog contacts: blue (#257de0). Current position: green.
- Season format: "2025-2026" (Aug–Jul boundary) — always use `seasonForDate()`.
- All data scoped to property_id via RLS. Never trust the client for authorization.
- Magic link auth (no passwords); 6-digit code entry also supported.
- DB auto-calcs (generated columns / triggers — never write these from the client):
  - total_coveys_seen = pointed + flushed_wild
  - total_birds_adult = cocks + hens
  - estimated_birds = coveys_heard × avg_covey_size
  - hunts.total_contacts = sum(dog_runs.contacts)
- Harvest adjustment: multiply bag by 1.3× for unrecovered birds (`lib/harvest.ts`).
- Weather auto-fills on hunt start from Open-Meteo using the property's center.
- Offline: field data entry must work with no signal. Inserts of gps_marks, hunts, dog_runs and
  covey_counts go through the outbox (`enqueue(insertOp(...))` with a client `crypto.randomUUID()`),
  never straight to Supabase. Order matters (hunt before its dog runs and mark updates). Screens read
  through `useCachedQuery` and merge queued rows (`pending*`, `withPending`, shown "Waiting to upload").
  PropertyProvider renders from `ct:cache:*` first. Sign out clears `ct:*`, IndexedDB and saved maps.
- Offline maps: only public-domain USGS tiles (Topo, Imagery+Topo) may be saved; Esri imagery terms
  forbid offline caching, so Esri layers stay online-only and MapView falls back to USGS when offline.
- The service worker never touches Supabase/Open-Meteo/Esri requests; it serves saved USGS tiles from
  `ct-tiles-v1` and only the explicit download adds to it. Bump `VERSION` in sw.js when changing caching.
- Boundaries: `properties.boundary` (parcels) and `courses.boundary` are JSON arrays of
  `{ name, rings: [[lng, lat], ...][] }` (GeoJSON order; first ring outline, rest holes). Course acres
  are recalculated from the outline on save. Field Mode preselects the course containing the GPS fix.
- Popups, tooltips and other user text in Leaflet: build DOM with `textContent`, never innerHTML
  (tooltips get an HTMLElement, not a string).
- Dog tracks (`public.dog_tracks`): imported from GPX after a hunt (online only), one row per dog,
  `points` = `[lng, lat, unixSeconds][]` thinned to ≥4 s apart (max 3000). Distance skips jumps faster
  than 18 m/s; "moving" = ≥0.6 m/s. The hunt page is `/hunt?id=` (static, so it's cached for offline).
- Public routes are `/`, `/login`, `/demo`, `/auth/*` (lib/supabase/middleware.ts PUBLIC_PATHS);
  everything else requires sign-in and redirects to `/login?next=…`.
- Waitlist (`public.waitlist`): anon may INSERT only; no select policy, so the list is only visible in
  the Supabase dashboard. Duplicate emails (23505) are treated as "already on the list".
- Roles: owner (everything + team + danger zone), manager (dogs/courses/settings, delete),
  handler (log hunts, marks, counts; may delete only their own unattached marks).

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build (runs lint + typecheck)
- `npm test` — unit tests for lib/ logic
- `npm run typecheck`
- `npx supabase db push` — apply migrations to a linked Supabase project
- `npx supabase gen types typescript --project-id <id>` — regenerate DB types
- `vercel` — deploy
