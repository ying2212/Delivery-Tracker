-- =====================================================================
-- Lorry number  (run once in Supabase → SQL Editor)
-- =====================================================================

-- The number painted on the driver's lorry (e.g. "93"). Office staff know
-- lorries by this number, so it is shown next to the driver's name.
alter table public.profiles add column if not exists lorry_no text;
