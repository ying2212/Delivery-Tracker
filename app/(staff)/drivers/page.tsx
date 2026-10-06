import { requireStaff } from "@/lib/auth";
import { pickBranch } from "@/lib/branches";
import { dateRange, todayMY } from "@/lib/format";
import type { DeliveryOrder, Profile } from "@/lib/types";
import { DriverTrips } from "@/components/DriverTrips";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

const MAX_DAYS = 31;

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();

  const from = sp.from || todayMY();
  const to = sp.to && sp.to >= from ? sp.to : from;
  const dates = dateRange(from, to, MAX_DAYS);

  // Opens on the user's own branch's drivers; they can switch to another branch or all.
  const { data: driverRows } = await supabase
    .from("profiles")
    .select("id, full_name, branch, lorry_no")
    .eq("role", "driver")
    .order("full_name");
  const allDrivers = (driverRows ?? []) as Pick<Profile, "id" | "full_name" | "branch" | "lorry_no">[];
  const branch = pickBranch(sp.branch, profile.branch);
  const branches = [...new Set([...allDrivers.map((d) => d.branch), branch].filter((b): b is string => !!b))].sort();
  const drivers = branch ? allDrivers.filter((d) => d.branch === branch) : allDrivers;

  let jobs: DeliveryOrder[] = [];
  if (drivers.length) {
    const { data } = await supabase
      .from("delivery_orders")
      .select("*, do_items(id)")
      .in("driver_id", drivers.map((d) => d.id))
      .gte("delivery_date", dates[0])
      .lte("delivery_date", dates[dates.length - 1])
      .order("trip_no")
      .order("trip_seq")
      .order("created_at");
    jobs = (data ?? []) as DeliveryOrder[];
  }
  const done = jobs.filter((j) => j.status === "delivered").length;

  return (
    <div className="space-y-5">
      <RealtimeRefresh table="delivery_orders" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Driver status</h1>
          <p className="text-sm text-slate-500">
            {branch ? `${branch} branch · ` : branches.length ? "All branches · " : ""}
            {done} of {jobs.length} delivered · drag orders to arrange trips
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          {branches.length > 0 && (
            <select name="branch" defaultValue={branch || "all"} className="input w-auto">
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>{b}{b === profile.branch ? " (mine)" : ""}</option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            From <input type="date" name="from" defaultValue={from} className="input w-auto" />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            To <input type="date" name="to" defaultValue={to} className="input w-auto" />
          </label>
          <button className="btn-secondary">Go</button>
        </form>
      </div>
      {dates[dates.length - 1] < to && (
        <p className="text-sm text-amber-700">Showing the first {MAX_DAYS} days only — pick a shorter range to see the rest.</p>
      )}

      {drivers.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No drivers {branch ? `in ${branch} branch` : "yet"}. Set a driver&apos;s branch in Supabase (<code>profiles.branch</code>).
        </div>
      ) : (
        <DriverTrips drivers={drivers} dates={dates} jobs={jobs} />
      )}
    </div>
  );
}
