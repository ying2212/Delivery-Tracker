import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { driverLabel, fmtDate, todayMY } from "@/lib/format";
import { BRANCHES, branchName, canPlan, deliveredOrSoldBy, lockedBranch, pickBranch } from "@/lib/branches";
import { DO_STATUSES, DO_STATUS_LABEL, type DeliveryOrder, type DoStatus, type Profile } from "@/lib/types";
import { AssignDriver } from "@/components/AssignDriver";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { BranchTags, SoLinks } from "@/components/DocLinks";
import { DoDate } from "@/components/MoveDate";

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

const PLANNABLE: DoStatus[] = ["pending", "assigned", "failed"];


const GRID_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5"];

const TAB = "rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap";
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
  searchParams: Promise<{ from?: string; to?: string; show?: string; q?: string; oc?: string; branch?: string }>;
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
  // O/C (customer collects at the store) is hidden unless staff turn it on.
  const showOc = sp.oc === "show";
  const q = (sp.q ?? "").trim();
  const term = q.replace(/[,()%*]/g, " ").trim();
  const { supabase, profile } = await requireStaff();
  // Opens on the user's own branch, like Driver status. Dispatchers can't switch away from theirs.
  const locked = lockedBranch(profile);
  const pickedBranch = pickBranch(sp.branch, profile.branch);
  const branch = locked ?? (BRANCHES.some((b) => b.code === pickedBranch) ? pickedBranch : "");

  // No dates picked = every delivery; otherwise only deliveries dated inside the range.
  // Searching a DO number looks across all dates (and branches, unless the user is kept to one) —
  // it's usually an older DO someone is asking about.
  let query = supabase
    .from("delivery_orders")
    .select("*, driver:profiles!delivery_orders_driver_id_fkey(full_name, lorry_no), do_items(id), links:do_sales_orders(so_no, so_id)")
    .eq("cancelled", false)
    .in("status", statuses)
    .order("delivery_date")
    .order("created_at");
  if (!showOc) query = query.eq("is_oc", false);
  if (locked) query = query.or(deliveredOrSoldBy(locked));
  if (term) query = query.ilike("do_no", `%${term}%`);
  else {
    if (from) query = query.gte("delivery_date", from);
    if (to) query = query.lte("delivery_date", to);
    // A branch sees what it delivers plus what it sold that another branch delivers (view only).
    if (branch && !locked) query = query.or(deliveredOrSoldBy(branch));
  }

  const [{ data }, { data: driverRows }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, lorry_no, branch").eq("role", "driver").order("full_name"),
  ]);
  const jobs = (data ?? []) as DeliveryOrder[];
  const drivers = (driverRows ?? []) as Pick<Profile, "id" | "full_name" | "lorry_no" | "branch">[];
  // The delivering branch's own drivers; everyone when that branch has none set up.
  const driversFor = (b: string | null) => {
    const own = drivers.filter((d) => d.branch === b);
    return own.length ? own : drivers;
  };
  const done = jobs.filter((j) => j.status === "delivered").length;

  const isToday = from === today && to === today;
  const isAllDates = !from && !to;
  // Filters that stay on while staff change other ones.
  const keep = {
    show: show || undefined,
    oc: showOc ? "show" : undefined,
    branch: sp.branch,
  };
  const dateParams = isToday ? {} : { from, to };
  const hidden = (params: Record<string, string | undefined>) =>
    Object.entries(params).map(([k, v]) => v !== undefined && <input key={k} type="hidden" name={k} value={v} />);
  const rangeLabel = term
    ? `DO no. matching "${term}" · all dates`
    : isToday
      ? `Today, ${fmtDate(today)}`
      : isAllDates
        ? "All dates"
        : `${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}`;
  const branchLabel = term && !locked ? "" : branch ? `${branch} branch · ` : "All branches · ";

  return (
    <div className="space-y-4">
      <RealtimeRefresh table="delivery_orders" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deliveries</h1>
          <p className="text-sm text-slate-500">
            {branchLabel}{rangeLabel} · {done} of {jobs.length} delivered · updates live
          </p>
        </div>
        <Link href="/deliveries/new" className="btn-primary">+ Special DO</Link>
      </div>

      <div className="card flex flex-wrap items-center gap-x-2.5 gap-y-2 p-2">
        <nav className="flex rounded-lg bg-slate-100 p-0.5">
          {(Object.keys(DELIVERY_FILTERS) as DeliveryFilter[]).map((value) => (
            <Link
              key={value}
              href={href({ ...keep, show: value || undefined, ...dateParams, q: q || undefined })}
              className={`${TAB} ${show === value ? TAB_ON : TAB_OFF}`}
            >
              {DELIVERY_FILTERS[value].label}
            </Link>
          ))}
        </nav>

        <Link
          href={href({ ...keep, oc: showOc ? undefined : "show", ...dateParams, q: q || undefined })}
          aria-pressed={showOc}
          className={`${TAB} border ${showOc ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500 hover:text-slate-900"}`}
        >
          {showOc ? "Showing O/C" : "Show O/C"}
        </Link>

        <div className={`flex flex-wrap items-center gap-2 ${term ? "opacity-50" : ""}`}>
          <nav className="flex rounded-lg bg-slate-100 p-0.5">
            <Link href={href(keep)} className={`${TAB} ${isToday && !term ? TAB_ON : TAB_OFF}`}>Today</Link>
            <Link href={href({ ...keep, from: "", to: "" })} className={`${TAB} ${isAllDates && !term ? TAB_ON : TAB_OFF}`}>
              All dates
            </Link>
          </nav>
          {/* Changing dates or branch starts a fresh look, so it drops any DO search. */}
          <form className="flex flex-wrap items-center gap-1.5">
            {hidden({ ...keep, branch: undefined })}
            {!locked && (
              <select name="branch" defaultValue={branch || "all"} aria-label="Branch" className="input w-auto px-2 py-1 text-xs">
                <option value="all">All branches</option>
                {BRANCHES.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code}{b.code === profile.branch ? " (mine)" : ""}
                  </option>
                ))}
              </select>
            )}
            <input type="date" name="from" defaultValue={from} aria-label="From" className="input w-auto px-2 py-1 text-xs" />
            <span className="text-slate-400">–</span>
            <input type="date" name="to" defaultValue={to} aria-label="To" className="input w-auto px-2 py-1 text-xs" />
            <button className="btn-secondary px-2.5 py-1 text-xs">Go</button>
          </form>
        </div>

        <form className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
          {hidden({ ...keep, ...(isToday ? {} : { from, to }) })}
          <input name="q" defaultValue={q} placeholder="🔍 Search DO no." className="input px-2 py-1 text-xs lg:w-40" />
          {q && (
            <Link href={href({ ...keep, ...dateParams })} className="whitespace-nowrap text-xs text-brand-700 hover:underline">
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
                  {col.map((j) => {
                    // Only the delivering branch picks the driver and day; others just follow along.
                    const mine = canPlan(profile.branch, j.branch);
                    const plannable = mine && PLANNABLE.includes(j.status);
                    const late = j.status !== "delivered" && j.delivery_date < today;
                    return (
                      <article key={j.id} className="card space-y-2 p-3">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                            {j.do_no}
                            {j.source === "special" && <span className="font-normal text-slate-400">· Special</span>}
                            {j.is_oc && <span className="font-normal text-slate-400">· O/C</span>}
                          </span>
                          <BranchTags job={j} />
                        </div>
                        <p className="text-xs text-slate-500">
                          <SoLinks job={j} />
                          {j.source !== "special" && <span className="text-slate-400"> · {j.do_items?.length ?? 0} items</span>}
                        </p>
                        <p className="text-sm font-medium leading-snug">{j.customer_name}</p>
                        {j.address && <p className="line-clamp-2 text-xs text-slate-500">{j.address}</p>}
                        {j.remarks && <p className="line-clamp-2 text-xs text-slate-500">📝 {j.remarks}</p>}
                        {j.instructions && <p className="line-clamp-2 text-xs text-slate-500">📋 {j.instructions}</p>}
                        {j.failed_reason && <p className="text-xs text-rose-600">{j.failed_reason}</p>}
                        {plannable ? (
                          <div className="space-y-1.5">
                            <AssignDriver key={`${j.driver_id}-${j.is_oc}`} doId={j.id} driverId={j.driver_id} isOc={j.is_oc} drivers={driversFor(j.branch)} />
                            <DoDate doId={j.id} date={j.delivery_date} today={today} />
                          </div>
                        ) : (
                          <div className="space-y-0.5 text-xs text-slate-500">
                            <p>🚚 {j.driver ? driverLabel(j.driver) : j.is_oc ? "O/C (customer collects)" : "No driver yet"}</p>
                            <p className={late ? "text-rose-600" : ""}>📅 {fmtDate(j.delivery_date)}{late && " · late"}</p>
                            {!mine && <p className="text-slate-400">{branchName(j.branch)} ({j.branch}) is delivering this DO</p>}
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {col.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Nothing here</p>}
                </div>
              </section>
            );
          })}
        </div>
    </div>
  );
}
