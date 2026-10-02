import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { SoBadge, DoBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/format";
import type { DoStatus, SoStatus } from "@/lib/types";

const TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "partial", label: "Partial" },
  { value: "fulfilled", label: "Fully on DO" },
];

type Row = {
  id: string;
  so_no: string;
  so_date: string;
  customer_name: string;
  branch: string | null;
  status: SoStatus;
  delivery_orders: { status: DoStatus }[];
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const { supabase } = await requireStaff();

  let query = supabase
    .from("sales_orders")
    .select("id, so_no, so_date, customer_name, branch, status, delivery_orders(status)")
    .order("so_date", { ascending: false })
    .order("so_no", { ascending: false })
    .limit(200);
  const term = q.replace(/[,()%]/g, " ").trim();
  if (term) query = query.or(`so_no.ilike.%${term}%,customer_name.ilike.%${term}%`);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const orders = (data ?? []) as Row[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales orders</h1>
          <p className="text-sm text-slate-500">Create delivery orders from here.</p>
        </div>
        <Link href="/orders/new" className="btn-primary">+ New order</Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={{ query: { ...(q && { q }), ...(t.value && { status: t.value }) } }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                status === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form className="flex-1 min-w-56">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Search SO no. or customer…" className="input" />
        </form>
      </div>

      <div className="card overflow-hidden">
        {orders.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No sales orders yet. <Link href="/import" className="font-medium text-brand-700">Import a CSV</Link> or create one.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">SO no.</th>
                <th className="px-4 py-3">Customer</th>
                <th className="hidden px-4 py-3 md:table-cell">Date</th>
                <th className="hidden px-4 py-3 lg:table-cell">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 sm:table-cell">Deliveries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="group hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/orders/${o.id}`} className="text-brand-700 group-hover:underline">{o.so_no}</Link>
                  </td>
                  <td className="px-4 py-3">{o.customer_name}</td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{fmtDate(o.so_date)}</td>
                  <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">{o.branch ?? "—"}</td>
                  <td className="px-4 py-3"><SoBadge status={o.status} /></td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {o.delivery_orders.length === 0 ? <span className="text-slate-400">—</span> :
                        o.delivery_orders.map((d, i) => <DoBadge key={i} status={d.status} />)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
