export type Role = "admin" | "dispatcher" | "driver";
export type SoStatus = "open" | "partial" | "fulfilled" | "cancelled";
export type DoStatus = "pending" | "assigned" | "out_for_delivery" | "delivered" | "failed";

export const DO_STATUSES: DoStatus[] = ["pending", "assigned", "out_for_delivery", "delivered", "failed"];

export const DO_STATUS_LABEL: Record<DoStatus, string> = {
  pending: "Unassigned",
  assigned: "Assigned",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Failed",
};

export const SO_STATUS_LABEL: Record<SoStatus, string> = {
  open: "Open",
  partial: "Partially on DO",
  fulfilled: "Fully on DO",
  cancelled: "Cancelled",
};

export type Profile = { id: string; full_name: string; role: Role; phone: string | null; branch: string | null; lorry_no: string | null };

export type SalesOrder = {
  id: string;
  so_no: string;
  so_date: string;
  debtor_code: string | null;
  customer_name: string;
  phone: string | null;
  address: string | null;
  branch: string | null;
  remarks: string | null;
  status: SoStatus;
  source: string;
};

export type SoItemProgress = {
  id: string;
  so_id: string;
  line_no: number;
  item_code: string;
  description: string | null;
  uom: string | null;
  qty: number;
  qty_on_do: number;
  qty_remaining: number;
};

export type DoItem = { id: string; item_code: string; description: string | null; uom: string | null; qty: number };

export type DeliveryOrder = {
  id: string;
  do_no: string;
  so_id: string;
  so_no: string;
  customer_name: string;
  contact_phone: string | null;
  address: string | null;
  delivery_date: string;
  branch: string | null;
  driver_id: string | null;
  trip_no: number;
  trip_seq: number;
  status: DoStatus;
  failed_reason: string | null;
  pod_photo_path: string | null;
  delivered_at: string | null;
  driver?: { full_name: string; lorry_no: string | null } | null;
  do_items?: DoItem[];
};

export type StatusEvent = {
  id: number;
  status: string;
  note: string | null;
  created_at: string;
  do_id: string | null;
  actor?: { full_name: string } | null;
};
