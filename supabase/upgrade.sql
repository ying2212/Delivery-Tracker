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

-- ---------- AutoCount import: extra SO / DO fields ----------------------
alter table public.sales_orders
  add column if not exists sales_location text,
  add column if not exists agent          text,
  add column if not exists credit_term    text,
  add column if not exists total          numeric(14, 2),
  add column if not exists transfer_to    text,
  add column if not exists icb_from_po    text,
  add column if not exists created_user   text,
  add column if not exists ac_created_at  timestamptz;

-- DOs come from AutoCount and can belong to several SOs (see do_sales_orders).
alter table public.delivery_orders alter column so_id drop not null;
alter table public.delivery_orders alter column so_no set default '';
alter table public.delivery_orders drop constraint if exists delivery_orders_so_id_fkey;
alter table public.delivery_orders
  add constraint delivery_orders_so_id_fkey foreign key (so_id) references public.sales_orders on delete set null;
alter table public.delivery_orders
  add column if not exists remarks      text,
  add column if not exists sales_branch text,
  add column if not exists ref          text,
  add column if not exists total        numeric(14, 2),
  add column if not exists invoice_no   text,
  add column if not exists created_user text,
  add column if not exists cancelled    boolean not null default false,
  add column if not exists source       text not null default 'manual';
create index if not exists delivery_orders_sales_branch_idx
  on public.delivery_orders (sales_branch, delivery_date);

-- One SO → many DOs, one DO → many SOs (same debtor).
create table if not exists public.do_sales_orders (
  do_id uuid not null references public.delivery_orders on delete cascade,
  so_no text not null,
  so_id uuid references public.sales_orders on delete set null,
  primary key (do_id, so_no)
);
create index if not exists do_sales_orders_so_no_idx on public.do_sales_orders (so_no);
create index if not exists do_sales_orders_so_id_idx on public.do_sales_orders (so_id);
alter table public.do_sales_orders enable row level security;
drop policy if exists "staff all" on public.do_sales_orders;
create policy "staff all" on public.do_sales_orders for all using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.do_sales_orders to authenticated;

-- Existing app-made DOs: record their one SO as a link.
insert into public.do_sales_orders (do_id, so_no, so_id)
select id, so_no, so_id from public.delivery_orders where so_id is not null and so_no <> ''
on conflict do nothing;

-- ---------- After an AutoCount import: tie SOs and DOs together --------
-- Fills do_sales_orders.so_id by SO number, copies the SOs' Remark 1 and
-- Delivery Phone onto their DOs (drivers can't read sales_orders), and
-- marks SOs that have a (non-cancelled) DO as fulfilled.
create or replace function public.sync_autocount_links() returns void
language sql security invoker set search_path = '' as $$
  update public.do_sales_orders l set so_id = s.id
  from public.sales_orders s
  where upper(s.so_no) = upper(l.so_no) and l.so_id is distinct from s.id;

  with agg as (
    select l.do_id,
      (array_agg(s.id order by s.so_no) filter (where s.id is not null))[1] as so_id,
      string_agg(distinct nullif(trim(s.remarks), ''), ' / ') as remarks,
      (array_agg(nullif(trim(s.phone), '') order by s.so_no) filter (where nullif(trim(s.phone), '') is not null))[1] as phone
    from public.do_sales_orders l
    left join public.sales_orders s on s.id = l.so_id
    group by l.do_id
  )
  update public.delivery_orders d set
    so_id = agg.so_id,
    remarks = agg.remarks,
    contact_phone = coalesce(agg.phone, d.contact_phone)
  from agg
  where d.id = agg.do_id
    and (d.so_id is distinct from agg.so_id
      or d.remarks is distinct from agg.remarks
      or d.contact_phone is distinct from coalesce(agg.phone, d.contact_phone));

  with st as (
    select s.id,
      case when exists (
        select 1 from public.do_sales_orders l
        join public.delivery_orders d on d.id = l.do_id
        where l.so_id = s.id and not d.cancelled
      ) then 'fulfilled'::public.so_status else 'open'::public.so_status end as status
    from public.sales_orders s
    where s.status <> 'cancelled'
  )
  update public.sales_orders s set status = st.status
  from st
  where s.id = st.id and s.status <> st.status;
$$;

-- ---------- After upgrading: set users' branch and lorry number --------
-- update profiles set branch = 'GP', lorry_no = '93' where full_name = 'Azli';
