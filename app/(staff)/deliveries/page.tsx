import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { driverLabel, fmtDate, todayMY } from "@/lib/format";
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

const DELIVERY_FILTERS = {
  "": { label: "All statuses", statuses: DO_STATUSES },
  delivered: { label: "Delivered", statuses: ["delivered"] as DoStatus[] },
  undelivered: { label: "Not delivered", statuses: DO_STATUSES.filter((s) => s !== "delivered") },
};
type DeliveryFilter = keyof typeof DELIVERY_FILTERS;

const GRID_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5"];

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from || "";
  const to = sp.to && (!from || sp.to >= from) ? sp.to : "";
  const show: DeliveryFilter = sp.show && sp.show in DELIVERY_FILTERS ? (sp.show as DeliveryFilter) : "";
  const statuses = DELIVERY_FILTERS[show].statuses;
  const today = todayMY();
  const { supabase } = await requireStaff();

  // No dates picked = every delivery; otherwise only deliveries dated inside the range.
  let query = supabase
    .from("delivery_orders")
    .select("*, driver:profiles!delivery_orders_driver_id_fkey(full_name, lorry_no), do_items(id)")
    .in("status", statuses)
    .order("delivery_date")
    .order("created_at");
  if (from) query = query.gte("delivery_date", from);
  if (to) query = query.lte("delivery_date", to);

  const [{ data }, { data: driverRows }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, lorry_no").eq("role", "driver").order("full_name"),
  ]);
  const jobs = (data ?? []) as DeliveryOrder[];
  const drivers = (driverRows ?? []) as Pick<Profile, "id" | "full_name" | "lorry_no">[];
  const done = jobs.filter((j) => j.status === "delivered").length;
  const filtered = !!(from || to || show);

  return (
    <div className="space-y-5">
      <RealtimeRefresh table="delivery_orders" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deliveries</h1>
          <p className="text-sm text-slate-500">
            {from || to ? `${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}` : "All dates"} · {done} of {jobs.length} delivered · updates live
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <select name="show" defaultValue={show} className="input w-auto">
            {Object.entries(DELIVERY_FILTERS).map(([value, f]) => (
              <option key={value} value={value}>{f.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            From <input type="date" name="from" defaultValue={from} className="input w-auto" />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            To <input type="date" name="to" defaultValue={to} className="input w-auto" />
          </label>
          <button className="btn-secondary">Go</button>
          {filtered && (
            <Link href="/deliveries" className="text-sm text-brand-700 hover:underline">Clear</Link>
          )}
        </form>
      </div>

      <div className={`-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid ${GRID_COLS[statuses.length]} lg:overflow-visible lg:px-0`}>
        {statuses.map((s) => {
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
                      {j.status !== "delivered" && j.delivery_date < today ? (
                        <span className="rounded bg-rose-50 px-1.5 text-rose-600">{fmtDate(j.delivery_date)} · late</span>
                      ) : (
                        <span>{fmtDate(j.delivery_date)}</span>
                      )}
                    </div>
                    {j.failed_reason && <p className="text-xs text-rose-600">{j.failed_reason}</p>}
                    {["pending", "assigned", "failed"].includes(j.status) ? (
                      <AssignDriver doId={j.id} driverId={j.driver_id} drivers={drivers} />
                    ) : (
                      <p className="text-xs text-slate-500">🚚 {j.driver ? driverLabel(j.driver) : "—"}</p>
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
