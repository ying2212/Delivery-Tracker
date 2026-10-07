import { getSession } from "@/lib/auth";
import { fmtDate, todayMY } from "@/lib/format";
import type { DeliveryOrder } from "@/lib/types";
import { JobCard } from "@/components/JobCard";
import { signOut } from "../actions";
import Link from "next/link";

/** YYYY-MM-DD moved by `days`. */
function shiftDate(d: string, days: number): string {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

export default async function DriverPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase, user, profile } = await getSession();
  const today = todayMY();
  const sp = await searchParams;
  // Always opens on today; the driver can pick another day to look back.
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const isToday = date === today;

  const { data } = await supabase
    .from("delivery_orders")
    .select("*, do_items(id, item_code, description, uom, qty)")
    .eq("driver_id", user.id)
    .eq("delivery_date", date)
    .eq("cancelled", false)
    .order("trip_no")
    .order("trip_seq")
    .order("created_at");
  // In the order the office planned on the Driver status page: trip by trip, stop by stop.
  const jobs = (data ?? []) as DeliveryOrder[];
  const done = jobs.filter((j) => j.status === "delivered").length;

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-10">
      <header className="sticky top-0 z-10 bg-brand-700 px-4 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Hi, {profile.full_name}</p>
            <h1 className="text-xl font-semibold">{isToday ? `Today · ${fmtDate(date)}` : fmtDate(date)}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {profile.role !== "driver" && <Link href="/deliveries" className="text-white/80">Back</Link>}
            <form action={signOut}><button className="text-white/80">Sign out</button></form>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Link href={`/driver?date=${shiftDate(date, -1)}`} className="rounded-lg bg-white/15 px-3 py-1.5" aria-label="Previous day">‹</Link>
          <form className="flex flex-1 items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="min-w-0 flex-1 rounded-lg bg-white/15 px-2 py-1.5 text-white [color-scheme:dark]"
            />
            <button className="rounded-lg bg-white/15 px-3 py-1.5">Go</button>
          </form>
          <Link href={`/driver?date=${shiftDate(date, 1)}`} className="rounded-lg bg-white/15 px-3 py-1.5" aria-label="Next day">›</Link>
          {!isToday && <Link href="/driver" className="rounded-lg bg-white px-3 py-1.5 font-medium text-brand-700">Today</Link>}
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-sm">
            <span>{done} of {jobs.length} delivered</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${jobs.length ? (done / jobs.length) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      <div className="space-y-3 px-4 pt-4">
        {jobs.length === 0 && (
          <div className="card p-10 text-center text-slate-500">{isToday ? "No deliveries assigned to you today" : `No deliveries on ${fmtDate(date)}`}</div>
        )}
        {jobs.map((j, i) => {
          const firstOfTrip = i === 0 || jobs[i - 1].trip_no !== j.trip_no;
          const trip = jobs.filter((x) => x.trip_no === j.trip_no);
          return (
            <div key={j.id} className="space-y-3">
              {firstOfTrip && (
                <h2 className="flex items-center justify-between pt-2 text-sm font-semibold text-slate-600">
                  <span>Trip {j.trip_no}</span>
                  <span className="font-normal text-slate-400">
                    {trip.filter((x) => x.status === "delivered").length}/{trip.length} delivered
                  </span>
                </h2>
              )}
              <JobCard job={j} driverName={profile.full_name} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
