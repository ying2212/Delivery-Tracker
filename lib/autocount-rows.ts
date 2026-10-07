/**
 * AutoCount documents in one clean shape. Today they come from the Excel
 * exports (parseAutoCountSheet); later the AutoCount API can be mapped to
 * the same types and fed to the same import (lib/autocount.ts).
 */

export type AcSalesOrder = {
  doc_no: string;
  date: string | null; // YYYY-MM-DD
  debtor_code: string | null;
  debtor_name: string | null;
  delivery_phone: string | null;
  sales_location: string | null;
  agent: string | null;
  credit_term: string | null;
  transfer_to: string | null; // DO number(s), "GPD-1, GPD-2"
  total: number | null;
  remark: string | null;
  delivery_address: string | null;
  created_user: string | null;
  created_time: string | null; // ISO with +08:00
  icb_from_po: string | null;
};

export type AcDeliveryOrder = {
  doc_no: string;
  date: string | null;
  debtor_code: string | null;
  debtor_name: string | null;
  sales_location: string | null;
  delivery_address: string | null;
  transfer_from: string | null; // SO number(s)
  transfer_to: string | null; // invoice number
  ref: string | null;
  phone: string | null;
  created_user: string | null;
  total: number | null;
  cancelled: boolean;
};

export type AcImport =
  | { kind: "so"; rows: AcSalesOrder[] }
  | { kind: "do"; rows: AcDeliveryOrder[] };

export type AcImportResult = {
  created: string[];
  updated: string[];
  warnings: string[];
  errors: string[];
  notes?: string[];
};

// ---------- Parsing exported sheets ------------------------------------

type Raw = Record<string, unknown>;

/** "Doc. No." → "doc_no", "Remark 1" → "remark_1" */
export const headerKey = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const text = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const pad = (n: number | string) => String(n).padStart(2, "0");

/**
 * Excel serial number or text ("06/10/2026", "2026-10-06", "06/10/2026 2:04:18 PM")
 * → wall-clock parts in Malaysia time. Day comes first, like AutoCount Malaysia.
 */
function dateParts(v: unknown): { date: string; time: string } | null {
  if (typeof v === "number" && v > 0) {
    const d = new Date(Math.round((v - 25569) * 86400000)); // serial → UTC with the same wall-clock digits
    const iso = d.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
  }
  const s = text(v);
  if (!s) return null;
  let date: string | null = null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  else if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
    date = `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  }
  if (!date) return null;
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i);
  let time = "00:00:00";
  if (t) {
    let h = Number(t[1]);
    if (t[4]?.toUpperCase() === "PM" && h < 12) h += 12;
    if (t[4]?.toUpperCase() === "AM" && h === 12) h = 0;
    time = `${pad(h)}:${t[2]}:${t[3] ?? "00"}`;
  }
  return { date, time };
}

const dateOnly = (v: unknown) => dateParts(v)?.date ?? null;
const dateTimeMY = (v: unknown) => {
  const p = dateParts(v);
  return p ? `${p.date}T${p.time}+08:00` : null;
};

/** Turns rows of an AutoCount SO or DO listing (keys = column headers) into clean documents. */
export function parseAutoCountSheet(rawRows: Raw[]): AcImport | { error: string } {
  const rows = rawRows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [headerKey(k), v])));
  const cols = new Set(rows.flatMap((r) => Object.keys(r)));
  if (!cols.has("doc_no")) return { error: 'This file has no "Doc. No." column. Export the SO or DO listing from AutoCount.' };

  if (cols.has("transfer_from")) {
    return {
      kind: "do",
      rows: rows
        .filter((r) => text(r.doc_no))
        .map((r) => ({
          doc_no: text(r.doc_no)!.toUpperCase(),
          date: dateOnly(r.date),
          debtor_code: text(r.debtor_code),
          debtor_name: text(r.debtor_name),
          sales_location: text(r.sales_location),
          delivery_address: text(r.delivery_address_1),
          transfer_from: text(r.transfer_from),
          transfer_to: text(r.transfer_to),
          ref: text(r.ref),
          phone: text(r.phone),
          created_user: text(r.created_user),
          total: num(r.total),
          cancelled: ["T", "TRUE", "Y", "YES", "1"].includes(String(r.cancelled ?? "").trim().toUpperCase()),
        })),
    };
  }

  return {
    kind: "so",
    rows: rows
      .filter((r) => text(r.doc_no))
      .map((r) => ({
        doc_no: text(r.doc_no)!.toUpperCase(),
        date: dateOnly(r.date),
        debtor_code: text(r.debtor_code),
        debtor_name: text(r.debtor_name),
        delivery_phone: text(r.delivery_phone),
        sales_location: text(r.sales_location),
        agent: text(r.agent),
        credit_term: text(r.credit_term),
        transfer_to: text(r.transfer_to),
        total: num(r.total),
        remark: text(r.remark_1),
        delivery_address: text(r.delivery_address_1),
        created_user: text(r.created_user),
        created_time: dateTimeMY(r.created_time),
        icb_from_po: text(r.icb_from_po_docno) ?? text(r.icb_frompodocno),
      })),
  };
}

/** "GPD-00044685, GPD-00044686" → ["GPD-00044685", "GPD-00044686"] */
export function splitDocNos(v: string | null | undefined): string[] {
  return [...new Set((v ?? "").split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
}
