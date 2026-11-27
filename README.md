# CoveyTracker

Phone-first hunting management for quail plantations: GPS-mark covey finds in real time, track dog
performance, monitor harvest pressure against sustainable budgets, and auto-fill weather conditions.

Built with Next.js 14, Supabase, Leaflet + Esri satellite imagery, and Open-Meteo.

**Live:** https://coveytracker.vercel.app (production deploys from `main`)

## Features

| Module | What it does |
| --- | --- |
| **Field Mode** | Pick a course, start a hunt (weather auto-fetched), big one-handed **Mark Covey** / **Dog Contact** buttons. Each tap saves a GPS-stamped mark on the phone and uploads it as soon as there's signal. **End Hunt** opens the logger pre-filled. Survives reloads; keeps the screen awake. |
| **Offline & install** | Add to the home screen from the browser menu. Once opened with signal, Field Mode opens and marks coveys with no signal; a status strip shows marks waiting to upload. |
| **Log Hunt** | 5-step wizard: Basics → Dogs → Coveys → Birds → Review, with auto-calculated totals. |
| **Hunts** | Filter by season/course, expand for full detail and per-dog chips, delete (managers). |
| **Dogs** | Ranked by contacts, bar chart, contacts/hr, hours, hunts. |
| **Courses** | Per-course aggregates and shot/pointed vs seen, % juvenile. |
| **Weather** | Current conditions, scenting rating, barometric note, Hunt Advisor ranking courses by coveys/hr. |
| **Covey Counts** | Fall listening surveys, GPS-stamped, estimated population per course. |
| **Harvest** | Adjustable harvest rate & covey size, per-course pressure gauges, 1.3× unrecovered-bird adjustment. |
| **Map** | Covey finds and contacts on satellite, hybrid (satellite + roads and place names) or USGS topo maps; live updates while hunting. |
| **Seasons** | Multi-season comparison cards with rate pills. |
| **Manage** | Dogs, courses, property location, team invites & roles, danger zone. |

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Apply the schema — either paste each file in `supabase/migrations/` into the **SQL Editor** and run
   them in order (`…_init.sql`, then `…_grants.sql`), or with the CLI:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   This creates all tables, enables RLS with the role policies, the auto-calc columns/triggers, and adds
   `gps_marks` to Realtime.
3. **Authentication → Providers → Email**: enabled (magic link is the default).
4. **Authentication → URL Configuration**:
   - Site URL: your production URL (e.g. `https://coveytracker.com`)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`
     (plus `https://*.vercel.app/auth/callback` for preview deploys).
5. *(Recommended)* **Authentication → Email Templates → Magic Link**: add `{{ .Token }}` to the template so
   users can type the 6-digit code — handy when a phone opens the email link in a different browser
   than the one they started in.
6. Copy **Project Settings → API** URL and anon key into `.env.local`.

> The free Supabase email sender is rate-limited (a few emails/hour). Configure custom SMTP
> (Authentication → SMTP) before inviting a real team.

### Team invites

Owners invite by email in **Manage → Team** (or during onboarding). The invite is stored in
`property_invites`; when that person signs in with the same email, they're added to the property with the
chosen role automatically. Just send them the site link.

## Deploy to Vercel

1. Import this GitHub repo at vercel.com → New Project.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy. Add your custom domain in the Vercel dashboard and update the Supabase Site URL / redirect URLs.

## Notes

- **Weather**: Open-Meteo is free without a key for non-commercial use. Commercial use needs a paid plan
  — budget for it before charging customers. Pressure uses sea-level (`pressure_msl`) so it matches a
  barometer and the 30.1 inHg "high pressure" threshold.
- **Offline scope**: Field Mode (marking) works offline. Saving the hunt form, the map tiles and the
  dashboards need signal — the marks wait on the phone until then. The service worker only runs in
  production builds (`npm run build && npm start`), not `npm run dev`.
- **GPS** needs HTTPS (or localhost) — browsers block geolocation on plain HTTP.
- **Tests**: `npm test` covers seasons, scenting model, harvest math and aggregations.

See `CLAUDE.md` for architecture and conventions, and the build spec's Phase 2 roadmap (GPX import,
boundaries, heat map, billing, PWA/offline).
