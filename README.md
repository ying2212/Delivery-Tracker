# Delivery Tracker

Tracks sales orders (SO) → delivery orders (DO) → driver → delivered, and lets drivers WhatsApp customers.
Built with Next.js, Supabase and Tailwind. AutoCount sync comes later; for now SOs are entered manually or imported from CSV.

## What's inside

| Page | Who | What it does |
|---|---|---|
| `/deliveries` | office | Board of today's DOs by status, assign drivers, updates live |
| `/drivers` | office | Driver status: each driver's orders from date to date, split into trips; drag orders to plan trips. Staff only see their own branch's drivers |
| `/orders` | office | SO list with search and status filter |
| `/orders/new` | office | Key in an SO by hand |
| `/orders/[id]` | office | SO detail, item progress, create (partial) DOs, POD photos, timeline |
| `/import` | office | Upload a CSV of SOs (template in `public/sample-sales-orders.csv`) |
| `/driver` | drivers | Phone view: today's jobs, Waze/Maps/Call, start → delivered with photo, or failed with reason, WhatsApp buttons |

Roles: **admin** and **dispatcher** see everything. **driver** only sees their own jobs (enforced in the database, not just the UI).

## Setup (about 15 minutes)

1. **Install** [Node.js 20+](https://nodejs.org), then in VS Code's terminal:
   ```bash
   npm install
   ```
2. **Create a Supabase project** at [supabase.com](https://supabase.com) (pick the Singapore region, it's closest to Malaysia).
3. **Create the database**: Supabase → SQL Editor → paste all of `supabase/schema.sql` → Run.
   Already set up before branches/trips existed? Run `supabase/migrations/002_branches_and_trips.sql` once instead.
   Already set up before lorry numbers existed? Also run `supabase/migrations/003_lorry_no.sql`, then set each driver's `profiles.lorry_no`.
4. **Connect the app**: copy `.env.example` to `.env.local` and fill in the URL and anon/publishable key from Supabase → Project Settings → API.
5. **Create users**: Supabase → Authentication → Users → Add user (tick *Auto confirm*). Everyone starts as a `driver`. Make yourself admin in the SQL Editor:
   ```sql
   update profiles set role = 'admin', full_name = 'Ying' where id = (select id from auth.users where email = 'you@company.com');
   -- office staff:
   update profiles set role = 'dispatcher' where id = (select id from auth.users where email = 'staff@company.com');
   -- drivers: just set their display name
   update profiles set full_name = 'Ali' where id = (select id from auth.users where email = 'ali@company.com');
   ```
6. **Run it**:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000, sign in, go to **Import** and upload `public/sample-sales-orders.csv` to get test data.

## Deploy

Push to GitHub → import the repo on [vercel.com](https://vercel.com) → add the same three env variables → Deploy.
Drivers open the link on their phone and use **Add to Home Screen** (Safari share menu on iPhone, ⋮ menu in Chrome on Android) so it behaves like an app.

## How data gets in (and where AutoCount plugs in later)

Everything goes through one function: `upsertSalesOrders()` in `lib/import.ts`.
- CSV upload and the New order form already call it.
- Later, an AutoCount sync script (reading AutoCount's SQL Server, read-only) should produce the same row shape and call the same function. Nothing else in the app has to change.
- Re-importing an SO with the same number updates it. Line items are only replaced if no DO has been created yet.

## Things to customise

- WhatsApp message wording: `lib/whatsapp.ts`
- Failure reasons for drivers: `FAIL_REASONS` in `components/JobCard.tsx`
- Accent colour: `--color-brand-*` in `app/globals.css`
- DO numbering (`DO-000001`): the `do_no` default in `supabase/schema.sql`

## Next ideas

- Automatic WhatsApp messages (Meta WhatsApp Cloud API) instead of tap-to-send buttons
- AutoCount sync script
- Reports: on-time rate per driver, failed deliveries by reason
- PO tracking
