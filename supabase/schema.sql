-- =====================================================================
-- Delivery Tracker — database schema
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- =====================================================================

-- ---------- Enums ----------------------------------------------------
create type public.user_role as enum ('admin', 'dispatcher', 'driver');
create type public.so_status as enum ('open', 'partial', 'fulfilled', 'cancelled');
create type public.do_status as enum ('pending', 'assigned', 'out_for_delivery', 'delivered', 'failed');

-- ---------- Users / roles --------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text not null default '',
  phone      text,
  role       public.user_role not null default 'driver',
  branch     text,                           -- GP, PD, …; pages open on this branch first
  lorry_no   text,                           -- number on the driver's lorry, e.g. "93"
  created_at timestamptz not null default now()
);

-- Every new login account gets a profile (role = driver unless set).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'driver')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'dispatcher'), false)
$$;

-- ---------- Sales orders (shaped like AutoCount SO) -------------------
create table public.sales_orders (
  id            uuid primary key default gen_random_uuid(),
  so_no         text not null unique,          -- AutoCount DocNo
  so_date       date not null default current_date,
  debtor_code   text,                          -- AutoCount DebtorCode
  customer_name text not null,
  phone         text,
  address       text,
  branch        text,
  remarks       text,
  status        public.so_status not null default 'open',
  source        text not null default 'manual', -- manual | csv | autocount
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index sales_orders_so_no_ci_key on public.sales_orders (upper(so_no)); -- "SO-001" = "so-001"

create table public.so_items (
  id          uuid primary key default gen_random_uuid(),
  so_id       uuid not null references public.sales_orders on delete cascade,
  line_no     int not null default 1,
  item_code   text not null,
  description text,
  uom         text,
  qty         numeric(12, 2) not null check (qty > 0)
);
create index on public.so_items (so_id);

-- ---------- Delivery orders ------------------------------------------
-- Customer/address/phone are copied from the SO so drivers never need
-- access to the sales_orders table.
create sequence public.do_no_seq;

create table public.delivery_orders (
  id             uuid primary key default gen_random_uuid(),
  do_no          text not null unique
                 default 'DO-' || lpad(nextval('public.do_no_seq')::text, 6, '0'),
  so_id          uuid not null references public.sales_orders on delete restrict,
  so_no          text not null,
  customer_name  text not null,
  contact_phone  text,
  address        text,
  delivery_date  date not null default current_date,
  branch         text,                         -- delivering branch/location (GP, PD, …); one SO can span several
  driver_id      uuid references public.profiles on delete set null,
  trip_no        int not null default 1 check (trip_no > 0), -- which trip of the driver's day
  trip_seq       int not null default 0,                     -- stop order inside the trip
  status         public.do_status not null default 'pending',
  failed_reason  text,
  pod_photo_path text,                         -- proof-of-delivery photo in storage bucket "pod"
  delivered_at   timestamptz,
  created_by     uuid default auth.uid() references public.profiles on delete set null,
  created_at     timestamptz not null default now()
);
create unique index delivery_orders_do_no_ci_key on public.delivery_orders (upper(do_no));
create index on public.delivery_orders (driver_id, delivery_date);
create index on public.delivery_orders (delivery_date, status);
create index on public.delivery_orders (so_id);
create index delivery_orders_branch_idx on public.delivery_orders (branch, delivery_date);
create index delivery_orders_trip_idx on public.delivery_orders (driver_id, delivery_date, trip_no, trip_seq);

create table public.do_items (
  id          uuid primary key default gen_random_uuid(),
  do_id       uuid not null references public.delivery_orders on delete cascade,
  so_item_id  uuid references public.so_items on delete set null,
  item_code   text not null,
  description text,
  uom         text,
  qty         numeric(12, 2) not null check (qty > 0)
);
create index on public.do_items (do_id);
create index on public.do_items (so_item_id);

-- ---------- Audit trail / timeline -----------------------------------
create table public.status_events (
  id         bigint generated always as identity primary key,
  so_id      uuid references public.sales_orders on delete cascade,
  do_id      uuid references public.delivery_orders on delete cascade,
  status     text not null,
  note       text,
  actor_id   uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index on public.status_events (so_id);
create index on public.status_events (do_id);

-- ---------- How much of each SO line is already on a DO --------------
create view public.so_item_progress with (security_invoker = true) as
select
  i.*,
  coalesce(sum(d.qty), 0)         as qty_on_do,
  i.qty - coalesce(sum(d.qty), 0) as qty_remaining
from public.so_items i
left join public.do_items d on d.so_item_id = i.id
group by i.id;

-- ---------- Row Level Security ---------------------------------------
alter table public.profiles        enable row level security;
alter table public.sales_orders    enable row level security;
alter table public.so_items        enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.do_items        enable row level security;
alter table public.status_events   enable row level security;

-- Profiles: see yourself; staff see everyone; admins edit roles.
create policy "read own or staff"   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "admin edits profiles" on public.profiles for update using (public.my_role() = 'admin');

-- Staff (admin + dispatcher) can do everything on business tables.
create policy "staff all" on public.sales_orders    for all using (public.is_staff()) with check (public.is_staff());
create policy "staff all" on public.so_items        for all using (public.is_staff()) with check (public.is_staff());
create policy "staff all" on public.delivery_orders for all using (public.is_staff()) with check (public.is_staff());
create policy "staff all" on public.do_items        for all using (public.is_staff()) with check (public.is_staff());
create policy "staff all" on public.status_events   for all using (public.is_staff()) with check (public.is_staff());

-- Drivers: only their own delivery jobs.
create policy "driver reads own DOs" on public.delivery_orders
  for select using (driver_id = auth.uid());
create policy "driver updates own DOs" on public.delivery_orders
  for update using (driver_id = auth.uid()) with check (driver_id = auth.uid());
create policy "driver reads own DO items" on public.do_items
  for select using (exists (
    select 1 from public.delivery_orders d where d.id = do_id and d.driver_id = auth.uid()));
create policy "driver logs own events" on public.status_events
  for insert with check (actor_id = auth.uid() and exists (
    select 1 from public.delivery_orders d where d.id = do_id and d.driver_id = auth.uid()));
create policy "driver reads own events" on public.status_events
  for select using (actor_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- Live updates for the dispatch board ----------------------
alter publication supabase_realtime add table public.delivery_orders;

-- ---------- Proof-of-delivery photo storage --------------------------
insert into storage.buckets (id, name, public) values ('pod', 'pod', false)
on conflict (id) do nothing;

create policy "pod upload" on storage.objects for insert to authenticated with check (bucket_id = 'pod');
create policy "pod read"   on storage.objects for select to authenticated using (bucket_id = 'pod');
