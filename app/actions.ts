"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireStaff } from "@/lib/auth";
import { driverLabel } from "@/lib/format";
import { importAcDeliveryOrders, importAcSalesOrders } from "@/lib/autocount";
import type { AcImport, AcImportResult } from "@/lib/autocount-rows";
import type { DoStatus } from "@/lib/types";

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

// ---------- AutoCount import -----------------------------------------

/** Saves an AutoCount SO or DO listing (parsed in the browser from the Excel export). */
export async function importAutoCount(data: AcImport): Promise<AcImportResult> {
  const { supabase } = await requireStaff();
  const result =
    data.kind === "so"
      ? await importAcSalesOrders(supabase, data.rows)
      : await importAcDeliveryOrders(supabase, data.rows);
  revalidatePath("/orders");
  revalidatePath("/deliveries");
  revalidatePath("/drivers");
  return result;
}

// ---------- Delivery orders (staff) ----------------------------------

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
    const { data: d } = await supabase.from("profiles").select("full_name, lorry_no").eq("id", driverId).single();
    driverName = d ? driverLabel(d) : "driver";
  }
  await supabase.from("status_events").insert({
    so_id: current.so_id,
    do_id: doId,
    status,
    note: driverId ? `Assigned to ${driverName}` : "Unassigned",
  });

  revalidatePath("/deliveries");
  revalidatePath("/orders/[id]", "page"); // a DO can belong to several SOs
}

// ---------- Trip planning (Driver status page) -----------------------

/**
 * Drops a DO into a driver's trip and saves the stop order of that trip.
 * `orderedIds` is the full order of the target trip after the drop.
 * Branch is only a default view, so staff can plan trips in any branch.
 */
export async function moveToTrip(input: {
  doId: string;
  driverId: string;
  date: string;
  tripNo: number;
  orderedIds: string[];
}) {
  const { supabase } = await requireStaff();
  const { doId, driverId, date, tripNo, orderedIds } = input;
  if (!Number.isInteger(tripNo) || tripNo < 1) throw new Error("Invalid trip");

  const { data: driver } = await supabase.from("profiles").select("full_name, role").eq("id", driverId).single();
  if (!driver || driver.role !== "driver") throw new Error("Driver not found");

  const { data: current } = await supabase
    .from("delivery_orders")
    .select("so_id, status, driver_id, delivery_date, trip_no")
    .eq("id", doId)
    .single();
  if (!current) throw new Error("Delivery order not found");
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
  revalidatePath("/orders/[id]", "page"); // a DO can belong to several SOs
}

// ---------- Delivery status (drivers + staff) ------------------------

async function logAndRevalidate(supabase: SupabaseClient, doId: string, status: DoStatus, note?: string | null) {
  const { data: d } = await supabase.from("delivery_orders").select("so_id").eq("id", doId).single();
  await supabase.from("status_events").insert({ so_id: d?.so_id, do_id: doId, status, note: note || null });
  revalidatePath("/driver");
  revalidatePath("/deliveries");
  revalidatePath("/orders/[id]", "page");
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
