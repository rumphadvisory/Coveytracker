-- Scouting: covey locations and habitat notes recorded without a hunt, dog or course.
-- type 'scout' = a habitat/property note; category = how a covey was found (seen/heard/flushed)
-- or the note's kind (cover, brood, food, burn, ...); birds = rough covey size.
alter table public.gps_marks drop constraint if exists gps_marks_type_check;
alter table public.gps_marks add constraint gps_marks_type_check check (type in ('covey', 'contact', 'scout'));
alter table public.gps_marks add column if not exists category text;
alter table public.gps_marks add column if not exists birds int check (birds is null or birds between 1 and 60);
notify pgrst, 'reload schema';
