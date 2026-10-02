import { getSession } from "@/lib/auth";
import { fmtDate, todayMY } from "@/lib/format";
import type { DeliveryOrder } from "@/lib/types";
import { JobCard } from "@/components/JobCard";
import { signOut } from "../actions";
import Link from "next/link";

export default async function DriverPage() {
  const { supabase, user, profile } = await getSession();
  const today = todayMY();

  // Today's jobs + anything unfinished from earlier days
  const { data } = await supabase
    .from("delivery_orders")
    .select("*, do_items(id, item_code, description, uom, qty)")
    .eq("driver_id", user.id)
    .or(`delivery_date.eq.${today},and(delivery_date.lt.${today},status.in.(assigned,out_for_delivery))`)
    .order("delivery_date")
    .order("trip_no")
    .order("trip_seq")
    .order("created_at");
  // In the order the office planned on the Driver status page: trip by trip, stop by stop.
  const jobs = (data ?? []) as DeliveryOrder[];
  const tripKey = (j: DeliveryOrder) => `${j.delivery_date < today ? "carry" : ""}${j.trip_no}`;
  const done = jobs.filter((j) => j.status === "delivered").length;

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-10">
      <header className="sticky top-0 z-10 bg-brand-700 px-4 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Hi, {profile.full_name}</p>
            <h1 className="text-xl font-semibold">{fmtDate(today)}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {profile.role !== "driver" && <Link href="/deliveries" className="text-white/80">Back</Link>}
            <form action={signOut}><button className="text-white/80">Sign out</button></form>
          </div>
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
          <div className="card p-10 text-center text-slate-500">No deliveries assigned to you today 🎉</div>
        )}
        {jobs.map((j, i) => {
          const firstOfTrip = i === 0 || tripKey(jobs[i - 1]) !== tripKey(j);
          const trip = jobs.filter((x) => tripKey(x) === tripKey(j));
          return (
            <div key={j.id} className="space-y-3">
              {firstOfTrip && (
                <h2 className="flex items-center justify-between pt-2 text-sm font-semibold text-slate-600">
                  <span>{j.delivery_date < today ? `Carried over from ${fmtDate(j.delivery_date)}` : `Trip ${j.trip_no}`}</span>
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
