-- Property parcels and course boundaries.
-- Each is a JSON array of named areas: [{ "name": "North tract", "rings": [[[lng, lat], ...], ...] }]
-- (first ring is the outline, any further rings are holes; GeoJSON coordinate order).
-- Existing row level security and grants on these tables already cover the new columns.

alter table public.properties add column if not exists boundary jsonb;
alter table public.courses    add column if not exists boundary jsonb;
