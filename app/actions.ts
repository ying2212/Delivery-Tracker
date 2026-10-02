"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireStaff } from "@/lib/auth";
import { upsertSalesOrders, type SoImportRow, type ImportResult } from "@/lib/import";
import type { DoStatus, SoItemProgress } from "@/lib/types";

// ---------- Auth ------------------------------------------------------

export async function signIn(_prev: { error?: string } | undefined, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return { error: "Wrong email or password." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------- Sales orders ----------------------------------------------

export async function importSalesOrders(
  rows: SoImportRow[],
  source: "csv" | "manual" = "csv"
): Promise<ImportResult> {
  const { supabase } = await requireStaff();
  const result = await upsertSalesOrders(supabase, rows, source);
  revalidatePath("/orders");
  return result;
}

async function recomputeSoStatus(supabase: SupabaseClient, soId: string) {
  const { data: so } = await supabase.from("sales_orders").select("status").eq("id", soId).single();
  if (!so || so.status === "cancelled") return;
  const { data: lines } = await supabase.from("so_item_progress").select("qty_on_do, qty_remaining").eq("so_id", soId);
  if (!lines?.length) return;
  const status = lines.every((l) => Number(l.qty_remaining) <= 0)
    ? "fulfilled"
    : lines.some((l) => Number(l.qty_on_do) > 0)
      ? "partial"
      : "open";
  await supabase.from("sales_orders").update({ status }).eq("id", soId);
}

// ---------- Delivery orders (staff) ----------------------------------

export async function createDeliveryOrder(formData: FormData) {
  const { supabase } = await requireStaff();
  const soId = String(formData.get("so_id"));
  const driverId = String(formData.get("driver_id") || "") || null;

  const { data: so } = await supabase.from("sales_orders").select("*").eq("id", soId).single();
  if (!so) throw new Error("Sales order not found");

  const { data: lines } = await supabase.from("so_item_progress").select("*").eq("so_id", soId);
  const items = ((lines ?? []) as SoItemProgress[])
    .map((l) => ({ line: l, qty: Math.min(Number(formData.get(`qty_${l.id}`) || 0), Number(l.qty_remaining)) }))
    .filter((x) => x.qty > 0);
  if (items.length === 0) throw new Error("Enter a quantity for at least one item.");

  const { data: delivery, error } = await supabase
    .from("delivery_orders")
    .insert({
      so_id: soId,
      so_no: so.so_no,
      customer_name: so.customer_name,
      contact_phone: String(formData.get("contact_phone") || "") || so.phone,
      address: String(formData.get("address") || "") || so.address,
      delivery_date: String(formData.get("delivery_date")),
      driver_id: driverId,
      status: driverId ? "assigned" : "pending",
    })
    .select("id, do_no")
    .single();
  if (error || !delivery) throw new Error(error?.message ?? "Could not create DO");

  await supabase.from("do_items").insert(
    items.map(({ line, qty }) => ({
      do_id: delivery.id,
      so_item_id: line.id,
      item_code: line.item_code,
      description: line.description,
      uom: line.uom,
      qty,
    }))
  );
  await supabase.from("status_events").insert({
    so_id: soId,
    do_id: delivery.id,
    status: driverId ? "assigned" : "do_created",
    note: `${delivery.do_no} created`,
  });
  await recomputeSoStatus(supabase, soId);

  revalidatePath(`/orders/${soId}`);
  revalidatePath("/deliveries");
}

export async function assignDriver(formData: FormData) {
  const { supabase } = await requireStaff();
  const doId = String(formData.get("do_id"));
  const driverId = String(formData.get("driver_id") || "") || null;
  const date = String(formData.get("delivery_date") || "") || undefined;

  const { data: current } = await supabase.from("delivery_orders").select("so_id, status").eq("id", doId).single();
  if (!current) return;

  let status: DoStatus = current.status;
  if (["pending", "assigned", "failed"].includes(current.status)) status = driverId ? "assigned" : "pending";

  await supabase
    .from("delivery_orders")
    .update({ driver_id: driverId, status, failed_reason: null, ...(date ? { delivery_date: date } : {}) })
    .eq("id", doId);

  let driverName = "nobody";
  if (driverId) {
    const { data: d } = await supabase.from("profiles").select("full_name").eq("id", driverId).single();
    driverName = d?.full_name ?? "driver";
  }
  await supabase.from("status_events").insert({
    so_id: current.so_id,
    do_id: doId,
    status,
    note: driverId ? `Assigned to ${driverName}` : "Unassigned",
  });

  revalidatePath("/deliveries");
  revalidatePath(`/orders/${current.so_id}`);
}

// ---------- Trip planning (Driver status page) -----------------------

/**
 * Drops a DO into a driver's trip and saves the stop order of that trip.
 * `orderedIds` is the full order of the target trip after the drop.
 * Staff with a branch can only touch drivers in their own branch.
 */
export async function moveToTrip(input: {
  doId: string;
  driverId: string;
  date: string;
  tripNo: number;
  orderedIds: string[];
}) {
  const { supabase, profile } = await requireStaff();
  const { doId, driverId, date, tripNo, orderedIds } = input;
  if (!Number.isInteger(tripNo) || tripNo < 1) throw new Error("Invalid trip");

  const { data: driver } = await supabase.from("profiles").select("full_name, role, branch").eq("id", driverId).single();
  if (!driver || driver.role !== "driver") throw new Error("Driver not found");
  if (profile.branch && driver.branch !== profile.branch) throw new Error("That driver is not in your branch.");

  const { data: current } = await supabase
    .from("delivery_orders")
    .select("so_id, status, driver_id, delivery_date, trip_no, driver:profiles!delivery_orders_driver_id_fkey(branch)")
    .eq("id", doId)
    .single();
  if (!current) throw new Error("Delivery order not found");
  const fromBranch = (current.driver as unknown as { branch: string | null } | null)?.branch ?? null;
  if (profile.branch && current.driver_id && fromBranch !== profile.branch) throw new Error("That order is not in your branch.");
  if (current.status === "delivered" || current.status === "out_for_delivery") {
    throw new Error("This order is already on the road or delivered and can't be moved.");
  }

  const reassigned = current.driver_id !== driverId || current.delivery_date !== date;
  const laneChanged = reassigned || current.trip_no !== tripNo;
  let status: DoStatus = current.status;
  if (reassigned) status = "assigned";

  const { error } = await supabase
    .from("delivery_orders")
    .update({
      driver_id: driverId,
      delivery_date: date,
      trip_no: tripNo,
      ...(reassigned ? { status, failed_reason: null } : {}),
    })
    .eq("id", doId);
  if (error) throw new Error(error.message);

  // Only rows that really are in this trip get renumbered.
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from("delivery_orders")
        .update({ trip_seq: i })
        .eq("id", id)
        .eq("driver_id", driverId)
        .eq("delivery_date", date)
        .eq("trip_no", tripNo)
    )
  );

  if (laneChanged) {
    await supabase.from("status_events").insert({
      so_id: current.so_id,
      do_id: doId,
      status,
      note: `Planned for ${driver.full_name} · Trip ${tripNo} · ${date}`,
    });
  }

  revalidatePath("/drivers");
  revalidatePath("/deliveries");
  revalidatePath("/driver");
  revalidatePath(`/orders/${current.so_id}`);
}

// ---------- Delivery status (drivers + staff) ------------------------

async function logAndRevalidate(supabase: SupabaseClient, doId: string, status: DoStatus, note?: string | null) {
  const { data: d } = await supabase.from("delivery_orders").select("so_id").eq("id", doId).single();
  await supabase.from("status_events").insert({ so_id: d?.so_id, do_id: doId, status, note: note || null });
  revalidatePath("/driver");
  revalidatePath("/deliveries");
  if (d) revalidatePath(`/orders/${d.so_id}`);
}

export async function startDelivery(doId: string) {
  const { supabase } = await getSession();
  const { error } = await supabase
    .from("delivery_orders")
    .update({ status: "out_for_delivery", failed_reason: null })
    .eq("id", doId);
  if (error) throw new Error(error.message);
  await logAndRevalidate(supabase, doId, "out_for_delivery");
}

export async function markDelivered(doId: string, photoPath: string | null, note: string) {
  const { supabase } = await getSession();
  const { error } = await supabase
    .from("delivery_orders")
    .update({ status: "delivered", pod_photo_path: photoPath, delivered_at: new Date().toISOString() })
    .eq("id", doId);
  if (error) throw new Error(error.message);
  await logAndRevalidate(supabase, doId, "delivered", note);
}

export async function markFailed(doId: string, reason: string) {
  const { supabase } = await getSession();
  const { error } = await supabase
    .from("delivery_orders")
    .update({ status: "failed", failed_reason: reason })
    .eq("id", doId);
  if (error) throw new Error(error.message);
  await logAndRevalidate(supabase, doId, "failed", reason);
}
