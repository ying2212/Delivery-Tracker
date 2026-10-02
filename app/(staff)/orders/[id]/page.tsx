import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createDeliveryOrder } from "@/app/actions";
import { DoBadge, SoBadge } from "@/components/StatusBadge";
import { fmtDate, fmtDateTime, fmtQty, todayMY } from "@/lib/format";
import { DO_STATUS_LABEL, type DeliveryOrder, type DoStatus, type Profile, type SalesOrder, type SoItemProgress, type StatusEvent } from "@/lib/types";

const EVENT_LABEL: Record<string, string> = { so_created: "Order created", do_created: "DO created", ...DO_STATUS_LABEL };

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();

  const [{ data: so }, { data: items }, { data: dos }, { data: events }, { data: drivers }] = await Promise.all([
    supabase.from("sales_orders").select("*").eq("id", id).single<SalesOrder>(),
    supabase.from("so_item_progress").select("*").eq("so_id", id).order("line_no"),
    supabase
      .from("delivery_orders")
      .select("*, driver:profiles!delivery_orders_driver_id_fkey(full_name), do_items(id, item_code, description, uom, qty)")
      .eq("so_id", id)
      .order("created_at"),
    supabase
      .from("status_events")
      .select("id, status, note, created_at, do_id, actor:profiles!status_events_actor_id_fkey(full_name)")
      .eq("so_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("role", "driver").order("full_name"),
  ]);
  if (!so) notFound();

  const lines = (items ?? []) as SoItemProgress[];
  const deliveries = (dos ?? []) as DeliveryOrder[];
  const timeline = (events ?? []) as unknown as StatusEvent[];
  const remaining = lines.filter((l) => Number(l.qty_remaining) > 0);

  // Signed links (valid 1 hour) for proof-of-delivery photos
  const photoUrls: Record<string, string> = {};
  for (const d of deliveries) {
    if (!d.pod_photo_path) continue;
    const { data } = await supabase.storage.from("pod").createSignedUrl(d.pod_photo_path, 3600);
    if (data) photoUrls[d.id] = data.signedUrl;
  }

  return (
    <div className="space-y-6">
      <Link href="/orders" className="text-sm text-slate-500 hover:text-slate-900">← Sales orders</Link>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{so.so_no}</h1>
              <SoBadge status={so.status} />
            </div>
            <p className="mt-1 text-slate-600">{so.customer_name}{so.debtor_code && <span className="text-slate-400"> · {so.debtor_code}</span>}</p>
          </div>
          <span className="text-xs text-slate-400">Source: {so.source}</span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Order date" value={fmtDate(so.so_date)} />
          <Field label="Phone" value={so.phone} />
          <Field label="Branch" value={so.branch} />
          <Field label="Address" value={so.address} />
        </dl>
        {so.remarks && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{so.remarks}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Items */}
          <section className="card overflow-hidden">
            <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Items</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Ordered</th>
                  <th className="px-3 py-2 text-right">On DO</th>
                  <th className="px-5 py-2 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{l.item_code}</div>
                      <div className="text-xs text-slate-500">{l.description}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(l.qty)} {l.uom}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(l.qty_on_do)}</td>
                    <td className={`px-5 py-2.5 text-right font-medium tabular-nums ${Number(l.qty_remaining) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {fmtQty(l.qty_remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Delivery orders */}
          <section className="space-y-3">
            <h2 className="font-semibold">Delivery orders</h2>
            {deliveries.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
            {deliveries.map((d) => (
              <div key={d.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{d.do_no}</span>
                    <DoBadge status={d.status as DoStatus} />
                  </div>
                  <span className="text-sm text-slate-500">
                    {fmtDate(d.delivery_date)} · {d.driver?.full_name ?? "No driver"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {d.do_items?.map((i) => `${i.item_code} × ${fmtQty(i.qty)}`).join(", ")}
                </p>
                {d.failed_reason && <p className="mt-2 text-sm text-rose-600">Failed: {d.failed_reason}</p>}
                {photoUrls[d.id] && (
                  <a href={photoUrls[d.id]} target="_blank" className="mt-3 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrls[d.id]} alt="Proof of delivery" className="h-24 rounded-lg border border-slate-200 object-cover" />
                  </a>
                )}
              </div>
            ))}
          </section>

          {/* Create DO */}
          {remaining.length > 0 && so.status !== "cancelled" && (
            <section className="card p-5">
              <h2 className="font-semibold">Create delivery order</h2>
              <p className="mb-4 text-sm text-slate-500">Lower the quantities for a partial delivery.</p>
              <form action={createDeliveryOrder} className="space-y-4">
                <input type="hidden" name="so_id" value={so.id} />
                <div className="space-y-2">
                  {remaining.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                      <div className="flex-1 text-sm">
                        <span className="font-medium">{l.item_code}</span>{" "}
                        <span className="text-slate-500">{l.description}</span>
                      </div>
                      <input
                        name={`qty_${l.id}`}
                        type="number"
                        step="any"
                        min={0}
                        max={l.qty_remaining}
                        defaultValue={l.qty_remaining}
                        className="input w-24 text-right"
                      />
                      <span className="w-10 text-xs text-slate-500">{l.uom}</span>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Delivery date</label>
                    <input name="delivery_date" type="date" defaultValue={todayMY()} required className="input" />
                  </div>
                  <div>
                    <label className="label">Driver</label>
                    <select name="driver_id" className="input" defaultValue="">
                      <option value="">Assign later</option>
                      {(drivers as Pick<Profile, "id" | "full_name">[] | null)?.map((d) => (
                        <option key={d.id} value={d.id}>{d.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Contact phone</label>
                    <input name="contact_phone" defaultValue={so.phone ?? ""} className="input" />
                  </div>
                  <div>
                    <label className="label">Delivery address</label>
                    <input name="address" defaultValue={so.address ?? ""} className="input" />
                  </div>
                </div>
                <button className="btn-primary">Create DO</button>
              </form>
            </section>
          )}
        </div>

        {/* Timeline */}
        <aside className="card h-fit p-5">
          <h2 className="mb-4 font-semibold">Timeline</h2>
          <ol className="relative space-y-5 border-l border-slate-200 pl-5">
            {timeline.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[25px] top-1 size-2.5 rounded-full bg-brand-600 ring-4 ring-white" />
                <p className="text-sm font-medium">{EVENT_LABEL[e.status] ?? e.status}</p>
                {e.note && <p className="text-sm text-slate-600">{e.note}</p>}
                <p className="text-xs text-slate-400">
                  {fmtDateTime(e.created_at)}{e.actor?.full_name && ` · ${e.actor.full_name}`}
                </p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value || "—"}</dd>
    </div>
  );
}
