"use client";

import { useTransition } from "react";
import { assignDriver } from "@/app/actions";
import { driverLabel } from "@/lib/format";

/** Pick a driver, or "O/C" when the customer collects at the store. */
export function AssignDriver({
  doId,
  driverId,
  isOc = false,
  drivers,
}: {
  doId: string;
  driverId: string | null;
  isOc?: boolean;
  drivers: { id: string; full_name: string; lorry_no: string | null }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      disabled={pending}
      defaultValue={isOc ? "oc" : (driverId ?? "")}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("do_id", doId);
        fd.set("driver_id", e.target.value);
        start(() => assignDriver(fd));
      }}
      className="input py-1.5 text-xs"
    >
      <option value="">Choose driver…</option>
      {drivers.map((d) => (
        <option key={d.id} value={d.id}>{driverLabel(d)}</option>
      ))}
      <option value="oc">O/C (customer collects)</option>
    </select>
  );
}
