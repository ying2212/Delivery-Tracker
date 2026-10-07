import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { BRANCHES, lockedBranch } from "@/lib/branches";
import { FAR_KM, FAR_POINTS, NEAR_POINTS } from "@/lib/commission";
import { driverLabel, todayMY } from "@/lib/format";
import { createSpecialDo } from "@/app/actions";
import type { Profile } from "@/lib/types";

export default async function NewSpecialDoPage() {
  const { supabase, profile } = await requireStaff();
  const { data } = await supabase.from("profiles").select("id, full_name, lorry_no").eq("role", "driver").order("full_name");
  const drivers = (data ?? []) as Pick<Profile, "id" | "full_name" | "lorry_no">[];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/deliveries" className="text-sm text-slate-500 hover:text-slate-900">← Deliveries</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New special DO</h1>
        <p className="text-sm text-slate-500">
          For deliveries that aren&apos;t an AutoCount DO — e.g. a stock transfer or a pick-up. It gets an SDO number and
          counts toward the driver&apos;s daily deliveries like any other DO.
        </p>
      </div>

      <form action={createSpecialDo} className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Deliver to (customer / place)</label>
          <input name="customer_name" required className="input" placeholder="e.g. Kempas branch, or customer name" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Delivery address</label>
          <input name="address" className="input" placeholder="Full address — the driver gets Waze / Maps buttons for it" />
        </div>
        <div>
          <label className="label">Contact phone</label>
          <input name="contact_phone" className="input" placeholder="012-345 6789" />
        </div>
        <div>
          <label className="label">Delivery date</label>
          <input name="delivery_date" type="date" defaultValue={todayMY()} required className="input" />
        </div>
        <div>
          <label className="label">Branch</label>
          <select name="branch" defaultValue={profile.branch ?? ""} className="input">
            {!lockedBranch(profile) && <option value="">—</option>}
            {BRANCHES.filter((b) => !lockedBranch(profile) || b.code === profile.branch).map((b) => <option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Driver</label>
          <select name="driver_id" defaultValue="" className="input">
            <option value="">Assign later</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{driverLabel(d)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Points for the driver</label>
          <input name="points" type="number" min={0} max={99} step={1} defaultValue={NEAR_POINTS} required className="input" />
          <p className="mt-1 text-xs text-slate-400">Usual rule: {FAR_POINTS} if over {FAR_KM} km, else {NEAR_POINTS}.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Instructions to driver</label>
          <textarea name="instructions" rows={3} className="input" placeholder="e.g. Collect 20 bags from supplier first, call Mr Tan on arrival" />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary">Create special DO</button>
          <Link href="/deliveries" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
