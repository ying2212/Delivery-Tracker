import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { fmtDate, todayMY } from "@/lib/format";
import { DO_STATUSES, DO_STATUS_LABEL, type DeliveryOrder, type DoStatus, type Profile } from "@/lib/types";
import { AssignDriver } from "@/components/AssignDriver";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

const COLUMN_DOT: Record<DoStatus, string> = {
  pending: "bg-slate-400",
  assigned: "bg-sky-500",
  out_for_delivery: "bg-amber-500",
  delivered: "bg-emerald-500",
  failed: "bg-rose-500",
};

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = todayMY() } = await searchParams;
  const { supabase } = await requireStaff();

  // Jobs for the chosen date, plus unfinished jobs carried over from earlier days.
  const [{ data }, { data: driverRows }] = await Promise.all([
    supabase
      .from("delivery_orders")
      .select("*, driver:profiles!delivery_orders_driver_id_fkey(full_name), do_items(id)")
      .or(`delivery_date.eq.${date},and(delivery_date.lt.${date},status.in.(pending,assigned,out_for_delivery,failed))`)
      .order("created_at"),
    supabase.from("profiles").select("id, full_name").eq("role", "driver").order("full_name"),
  ]);
  const jobs = (data ?? []) as DeliveryOrder[];
  const drivers = (driverRows ?? []) as Pick<Profile, "id" | "full_name">[];
  const done = jobs.filter((j) => j.status === "delivered").length;

  return (
    <div className="space-y-5">
      <RealtimeRefresh table="delivery_orders" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deliveries</h1>
          <p className="text-sm text-slate-500">
            {done} of {jobs.length} delivered · updates live
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={date} className="input w-auto" />
          <button className="btn-secondary">Go</button>
        </form>
      </div>

      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {DO_STATUSES.map((s) => {
          const col = jobs.filter((j) => j.status === s);
          return (
            <section key={s} className="w-72 shrink-0 snap-start rounded-2xl bg-slate-100/70 p-2 lg:w-auto">
              <h2 className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-slate-700">
                <span className={`size-2 rounded-full ${COLUMN_DOT[s]}`} />
                {DO_STATUS_LABEL[s]}
                <span className="ml-auto rounded-full bg-white px-2 text-xs font-medium text-slate-500">{col.length}</span>
              </h2>
              <div className="space-y-2">
                {col.map((j) => (
                  <article key={j.id} className="card space-y-2 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{j.do_no}</span>
                      <Link href={`/orders/${j.so_id}`} className="text-brand-700 hover:underline">{j.so_no}</Link>
                    </div>
                    <p className="text-sm font-medium leading-snug">{j.customer_name}</p>
                    {j.address && <p className="line-clamp-2 text-xs text-slate-500">{j.address}</p>}
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{j.do_items?.length ?? 0} items</span>
                      {j.delivery_date < date && <span className="rounded bg-rose-50 px-1.5 text-rose-600">from {fmtDate(j.delivery_date)}</span>}
                    </div>
                    {j.failed_reason && <p className="text-xs text-rose-600">{j.failed_reason}</p>}
                    {["pending", "assigned", "failed"].includes(j.status) ? (
                      <AssignDriver doId={j.id} driverId={j.driver_id} drivers={drivers} />
                    ) : (
                      <p className="text-xs text-slate-500">🚚 {j.driver?.full_name ?? "—"}</p>
                    )}
                  </article>
                ))}
                {col.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Nothing here</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
