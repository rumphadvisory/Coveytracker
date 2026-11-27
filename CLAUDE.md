# CoveyTracker

Quail plantation hunting management SaaS. GPS covey mapping, dog performance analytics, weather integration, harvest budget tracking.

## Stack
- Next.js 14 (App Router) + Tailwind CSS + TypeScript
- Supabase (Postgres, Auth, Realtime, RLS) via `@supabase/ssr`
- Leaflet.js + Esri World Imagery for satellite maps
- Open-Meteo API for weather (no key needed)
- Vercel for hosting

## Project Structure
```
app/
  layout.tsx            # Root layout, fonts (Libre Baskerville / DM Sans), Material Symbols
  page.tsx              # Landing / magic-link login
  auth/callback/        # Magic link + token_hash exchange
  auth/signout/         # POST sign out
  onboarding/page.tsx   # Create property → courses/dogs → invite team
  (app)/
    layout.tsx          # PropertyProvider + Nav (auth required)
    field/page.tsx      # Field Mode (GPS marking)
    log/page.tsx        # Hunt logger wizard (?from=field pre-fills from the field session)
    hunts/page.tsx      # Hunt list with filters
    dogs/page.tsx       # Dog performance
    courses/page.tsx    # Course stats
    weather/page.tsx    # Weather dashboard + scenting + hunt advisor
    map/page.tsx        # Leaflet satellite map (realtime marks)
    counts/page.tsx     # Fall covey count surveys
    harvest/page.tsx    # Harvest budget calculator
    season/page.tsx     # Season dashboard
    manage/page.tsx     # Dogs, courses, property, team, danger zone
components/
  PropertyProvider.tsx  # Current user/property/role/dogs/courses context (useProperty)
  Nav.tsx               # Top nav (desktop) + bottom bar & "More" sheet (mobile)
  HuntWizard.tsx        # 5-step hunt form
  MapView.tsx           # Leaflet wrapper (client-only; load with next/dynamic ssr:false)
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
- Popups/user text in Leaflet: build DOM with `textContent`, never innerHTML.
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
