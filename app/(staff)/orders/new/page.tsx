"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { importSalesOrders } from "@/app/actions";
import { todayMY } from "@/lib/format";

type Line = { item_code: string; description: string; uom: string; qty: string };
const emptyLine: Line = { item_code: "", description: "", uom: "", qty: "" };

export default function NewOrderPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);

  const setLine = (i: number, k: keyof Line, v: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  function submit(form: FormData) {
    const header = Object.fromEntries(form.entries()) as Record<string, string>;
    const rows = lines
      .filter((l) => l.item_code.trim())
      .map((l) => ({ ...header, ...l, so_no: header.so_no, customer_name: header.customer_name }));
    if (rows.length === 0) return setError("Add at least one item.");
    setError(null);
    start(async () => {
      const res = await importSalesOrders(rows, "manual");
      if (res.errors.length) return setError(res.errors.join("\n"));
      router.push("/orders");
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/orders" className="text-sm text-slate-500 hover:text-slate-900">← Sales orders</Link>
      <h1 className="text-2xl font-semibold tracking-tight">New sales order</h1>

      <form action={submit} className="space-y-5">
        <div className="card grid gap-4 p-5 sm:grid-cols-2">
          <Input name="so_no" label="SO no. (same as AutoCount)" required />
          <Input name="so_date" label="Order date" type="date" defaultValue={todayMY()} />
          <Input name="customer_name" label="Customer name" required />
          <Input name="debtor_code" label="Debtor code" />
          <Input name="phone" label="Phone (for WhatsApp)" placeholder="012-345 6789" />
          <Input name="branch" label="Branch" />
          <div className="sm:col-span-2"><Input name="address" label="Delivery address" /></div>
          <div className="sm:col-span-2"><Input name="remarks" label="Remarks" /></div>
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">Items</h2>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input className="input col-span-3" placeholder="Item code" value={l.item_code} onChange={(e) => setLine(i, "item_code", e.target.value)} />
              <input className="input col-span-5" placeholder="Description" value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} />
              <input className="input col-span-2" placeholder="Qty" type="number" step="any" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
              <input className="input col-span-2" placeholder="UOM" value={l.uom} onChange={(e) => setLine(i, "uom", e.target.value)} />
            </div>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])} className="text-sm font-medium text-brand-700">
            + Add item
          </button>
        </div>

        {error && <pre className="whitespace-pre-wrap rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</pre>}
        <button disabled={pending} className="btn-primary">{pending ? "Saving…" : "Save order"}</button>
      </form>
    </div>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" {...props} />
    </div>
  );
}
