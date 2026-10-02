-- =====================================================================
-- Branches + trips  (run once in Supabase → SQL Editor, BEFORE deploying
-- the app version that has the "Driver status" page)
-- =====================================================================

-- Which branch a user belongs to. Drivers belong to one branch; office
-- staff with a branch only see that branch's drivers. Staff with no
-- branch (e.g. admin) see every branch.
alter table public.profiles add column if not exists branch text;

-- A driver's day is split into trips (1, 2, 3 …); trip_seq is the stop
-- order inside a trip. Set by dragging on the Driver status page.
alter table public.delivery_orders
  add column if not exists trip_no  int not null default 1 check (trip_no > 0),
  add column if not exists trip_seq int not null default 0;

create index if not exists delivery_orders_trip_idx
  on public.delivery_orders (driver_id, delivery_date, trip_no, trip_seq);

-- Put users in branches, e.g.:
-- update profiles set branch = 'KL'     where id = (select id from auth.users where email = 'ali@company.com');
-- update profiles set branch = 'Penang' where id = (select id from auth.users where email = 'staff.pg@company.com');
