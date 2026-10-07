import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { driverLabel, fmtDate, todayMY } from "@/lib/format";
import { DO_STATUSES, DO_STATUS_LABEL, type DeliveryOrder, type DoStatus, type Profile } from "@/lib/types";
import { AssignDriver } from "@/components/AssignDriver";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { BranchTags, SoLinks } from "@/components/DocLinks";

const COLUMN_DOT: Record<DoStatus, string> = {
  pending: "bg-slate-400",
  assigned: "bg-sky-500",
  out_for_delivery: "bg-amber-500",
  delivered: "bg-emerald-500",
  failed: "bg-rose-500",
};

const DELIVERY_FILTERS = {
  "": { label: "All", statuses: DO_STATUSES },
  undelivered: { label: "Not delivered", statuses: DO_STATUSES.filter((s) => s !== "delivered") },
  delivered: { label: "Delivered", statuses: ["delivered"] as DoStatus[] },
};
type DeliveryFilter = keyof typeof DELIVERY_FILTERS;

const GRID_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5"];

const TAB = "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap";
const TAB_ON = "bg-white text-slate-900 shadow-sm";
const TAB_OFF = "text-slate-500 hover:text-slate-900";

/** "/deliveries?…" — undefined params are left out, "" is kept (from=&to= means all dates). */
function href(params: Record<string, string | undefined>) {
  const qs = Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `/deliveries?${qs}` : "/deliveries";
}

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; show?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const today = todayMY();
  // Opening the page (no from/to in the URL) always shows today. Once staff
  // pick dates, those are used — both left blank means all dates.
  const picked = sp.from !== undefined || sp.to !== undefined;
  const from = picked ? sp.from || "" : today;
  const to = picked ? (sp.to && (!from || sp.to >= from) ? sp.to : "") : today;
  const show: DeliveryFilter = sp.show && sp.show in DELIVERY_FILTERS ? (sp.show as DeliveryFilter) : "";
  const statuses = DELIVERY_FILTERS[show].statuses;
  const q = (sp.q ?? "").trim();
  const term = q.replace(/[,()%*]/g, " ").trim();
  const { supabase } = await requireStaff();

  // No dates picked = every delivery; otherwise only deliveries dated inside the range.
  // Searching a DO number looks across all dates — it's usually an older DO someone is asking about.
  let query = supabase
    .from("delivery_orders")
    .select("*, driver:profiles!delivery_orders_driver_id_fkey(full_name, lorry_no), do_items(id), links:do_sales_orders(so_no, so_id)")
    .eq("cancelled", false)
    .in("status", statuses)
    .order("delivery_date")
    .order("created_at");
  if (term) query = query.ilike("do_no", `%${term}%`);
  else {
    if (from) query = query.gte("delivery_date", from);
    if (to) query = query.lte("delivery_date", to);
  }

  const [{ data }, { data: driverRows }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, lorry_no").eq("role", "driver").order("full_name"),
  ]);
  const jobs = (data ?? []) as DeliveryOrder[];
  const drivers = (driverRows ?? []) as Pick<Profile, "id" | "full_name" | "lorry_no">[];
  const done = jobs.filter((j) => j.status === "delivered").length;

  const isToday = from === today && to === today;
  const isAllDates = !from && !to;
  const showParam = show || undefined;
  const dateParams = isToday ? {} : { from, to };
  const rangeLabel = term
    ? `DO no. matching "${term}" · all dates`
    : isToday
      ? `Today, ${fmtDate(today)}`
      : isAllDates
        ? "All dates"
        : `${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}`;

  return (
    <div className="space-y-4">
      <RealtimeRefresh table="delivery_orders" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Deliveries</h1>
        <p className="text-sm text-slate-500">
          {rangeLabel} · {done} of {jobs.length} delivered · updates live
        </p>
      </div>

      <div className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-2.5">
        <nav className="flex rounded-xl bg-slate-100 p-1">
          {(Object.keys(DELIVERY_FILTERS) as DeliveryFilter[]).map((value) => (
            <Link
              key={value}
              href={href({ show: value || undefined, ...dateParams, q: q || undefined })}
              className={`${TAB} ${show === value ? TAB_ON : TAB_OFF}`}
            >
              {DELIVERY_FILTERS[value].label}
            </Link>
          ))}
        </nav>

        <div className={`flex flex-wrap items-center gap-2 ${term ? "opacity-50" : ""}`}>
          <nav className="flex rounded-xl bg-slate-100 p-1">
            <Link href={href({ show: showParam })} className={`${TAB} ${isToday && !term ? TAB_ON : TAB_OFF}`}>Today</Link>
            <Link href={href({ show: showParam, from: "", to: "" })} className={`${TAB} ${isAllDates && !term ? TAB_ON : TAB_OFF}`}>
              All dates
            </Link>
          </nav>
          {/* Changing dates starts a fresh look, so it drops any DO search. */}
          <form className="flex items-center gap-1.5">
            {show && <input type="hidden" name="show" value={show} />}
            <input type="date" name="from" defaultValue={from} aria-label="From" className="input w-auto py-1.5 text-sm" />
            <span className="text-slate-400">–</span>
            <input type="date" name="to" defaultValue={to} aria-label="To" className="input w-auto py-1.5 text-sm" />
            <button className="btn-secondary py-1.5">Go</button>
          </form>
        </div>

        <form className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
          {show && <input type="hidden" name="show" value={show} />}
          {!isToday && (
            <>
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
            </>
          )}
          <input name="q" defaultValue={q} placeholder="🔍 Search DO no." className="input py-1.5 text-sm lg:w-48" />
          {q && (
            <Link href={href({ show: showParam, ...dateParams })} className="whitespace-nowrap text-sm text-brand-700 hover:underline">
              Clear
            </Link>
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
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900">{j.do_no}</span>
                      <BranchTags job={j} />
                    </div>
                    <SoLinks job={j} className="block text-xs text-slate-500" />
                    <p className="text-sm font-medium leading-snug">{j.customer_name}</p>
                    {j.address && <p className="line-clamp-2 text-xs text-slate-500">{j.address}</p>}
                    {j.remarks && <p className="line-clamp-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{j.remarks}</p>}
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
