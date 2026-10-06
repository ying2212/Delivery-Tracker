-- =====================================================================
-- Delivery Tracker — upgrade an EXISTING database to the latest version
--
-- New setup? You don't need this file: schema.sql already has everything.
-- Set up before the latest changes? Run this whole file once in
-- Supabase → SQL Editor. It is safe to run again; anything already
-- there is skipped.
-- =====================================================================

-- ---------- Users: branch + lorry number ------------------------------
-- Branch (GP, PD, …) a user belongs to; pages open on that branch first.
alter table public.profiles add column if not exists branch text;
-- Number on the driver's lorry (e.g. "93"); shown next to the driver's name.
alter table public.profiles add column if not exists lorry_no text;

-- ---------- Delivery orders: trips + branch ---------------------------
-- A driver's day is split into trips (1, 2, 3 …); trip_seq is the stop
-- order inside a trip. Set by dragging on the Driver status page.
alter table public.delivery_orders
  add column if not exists trip_no  int not null default 1 check (trip_no > 0),
  add column if not exists trip_seq int not null default 0,
  -- Delivering branch/location; one SO can be delivered from several branches.
  add column if not exists branch   text;

create index if not exists delivery_orders_trip_idx
  on public.delivery_orders (driver_id, delivery_date, trip_no, trip_seq);
create index if not exists delivery_orders_branch_idx
  on public.delivery_orders (branch, delivery_date);

-- Older DOs without a branch: take the driver's branch, else the creator's.
update public.delivery_orders d set branch = p.branch
from public.profiles p
where d.branch is null and p.id = d.driver_id and p.branch is not null;

update public.delivery_orders d set branch = p.branch
from public.profiles p
where d.branch is null and p.id = d.created_by and p.branch is not null;

-- ---------- SO / DO numbers unique, ignoring upper/lower case ---------
-- If this fails with "could not create unique index", some numbers are
-- already duplicated. Find them, fix or delete the extra rows, run again:
--   select upper(so_no), count(*) from sales_orders group by 1 having count(*) > 1;
--   select upper(do_no), count(*) from delivery_orders group by 1 having count(*) > 1;
create unique index if not exists sales_orders_so_no_ci_key on public.sales_orders (upper(so_no));
create unique index if not exists delivery_orders_do_no_ci_key on public.delivery_orders (upper(do_no));

-- ---------- After upgrading: set users' branch and lorry number --------
-- update profiles set branch = 'GP', lorry_no = '93' where full_name = 'Azli';
