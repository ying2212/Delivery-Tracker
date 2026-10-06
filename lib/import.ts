import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One row = one SO line item. Same shape whether it comes from
 * the CSV upload, the "New order" form, or (later) an AutoCount sync.
 */
export type SoImportRow = {
  so_no: string;
  so_date?: string;
  debtor_code?: string;
  customer_name: string;
  phone?: string;
  address?: string;
  branch?: string;
  remarks?: string;
  item_code: string;
  description?: string;
  uom?: string;
  qty: number | string;
};

export type ImportResult = {
  created: string[];
  updated: string[];
  itemsLocked: string[]; // SOs that already have DOs, so their items were left alone
  errors: string[];
};

/** Accepts 2026-10-02, 02/10/2026 or 2/10/26 (day first, like AutoCount Malaysia). */
function parseDate(v?: string): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return undefined;
  const year = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const clean = (v: unknown) => (v == null ? undefined : String(v).trim() || undefined);

/**
 * THE single entry point for getting sales orders into the app.
 * - Creates new SOs, updates headers of existing ones (matched by so_no).
 *   The "New order" form (source = manual) never updates: an SO number
 *   that is already in the system is rejected instead.
 * - Replaces line items only if the SO has no delivery orders yet.
 * SO numbers are stored in upper case so "so-001" and "SO-001" are the same order.
 */
export async function upsertSalesOrders(
  supabase: SupabaseClient,
  rows: SoImportRow[],
  source: "csv" | "manual" | "autocount"
): Promise<ImportResult> {
  const result: ImportResult = { created: [], updated: [], itemsLocked: [], errors: [] };

  // Group rows by SO number
  const groups = new Map<string, SoImportRow[]>();
  rows.forEach((r, i) => {
    const so_no = clean(r.so_no)?.toUpperCase();
    const qty = Number(String(r.qty ?? "").replace(/,/g, ""));
    if (!so_no) return result.errors.push(`Row ${i + 2}: missing so_no`);
    if (!clean(r.customer_name)) return result.errors.push(`Row ${i + 2} (${so_no}): missing customer_name`);
    if (!clean(r.item_code)) return result.errors.push(`Row ${i + 2} (${so_no}): missing item_code`);
    if (!(qty > 0)) return result.errors.push(`Row ${i + 2} (${so_no}): qty must be more than 0`);
    groups.set(so_no, [...(groups.get(so_no) ?? []), { ...r, so_no, qty }]);
  });
  if (groups.size === 0) return result;

  const { data: existing } = await supabase
    .from("sales_orders")
    .select("so_no")
    .in("so_no", [...groups.keys()]);
  const existingSet = new Set((existing ?? []).map((e) => e.so_no));

  for (const [so_no, lines] of groups) {
    if (source === "manual" && existingSet.has(so_no)) {
      result.errors.push(`${so_no} is already in the system. Use a different SO number.`);
      continue;
    }
    const h = lines[0];
    const { data: so, error } = await supabase
      .from("sales_orders")
      .upsert(
        {
          so_no,
          so_date: parseDate(h.so_date) ?? new Date().toISOString().slice(0, 10),
          debtor_code: clean(h.debtor_code) ?? null,
          customer_name: clean(h.customer_name)!,
          phone: clean(h.phone) ?? null,
          address: clean(h.address) ?? null,
          branch: clean(h.branch) ?? null,
          remarks: clean(h.remarks) ?? null,
          source,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "so_no" }
      )
      .select("id")
      .single();

    if (error?.code === "23505") {
      // Unique index on upper(so_no): an older SO saved in different letter case.
      result.errors.push(`${so_no} is already in the system (with different upper/lower case).`);
      continue;
    }
    if (error || !so) {
      result.errors.push(`${so_no}: ${error?.message ?? "could not save"}`);
      continue;
    }

    const { count } = await supabase
      .from("delivery_orders")
      .select("id", { count: "exact", head: true })
      .eq("so_id", so.id);

    if ((count ?? 0) > 0) {
      result.itemsLocked.push(so_no);
    } else {
      await supabase.from("so_items").delete().eq("so_id", so.id);
      const { error: itemErr } = await supabase.from("so_items").insert(
        lines.map((l, idx) => ({
          so_id: so.id,
          line_no: idx + 1,
          item_code: clean(l.item_code)!,
          description: clean(l.description) ?? null,
          uom: clean(l.uom) ?? null,
          qty: Number(l.qty),
        }))
      );
      if (itemErr) result.errors.push(`${so_no} items: ${itemErr.message}`);
    }

    if (existingSet.has(so_no)) {
      result.updated.push(so_no);
    } else {
      result.created.push(so_no);
      await supabase.from("status_events").insert({
        so_id: so.id,
        status: "so_created",
        note: source === "manual" ? "Entered manually" : `Imported (${source})`,
      });
    }
  }
  return result;
}
