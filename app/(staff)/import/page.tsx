"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { importSalesOrders } from "@/app/actions";
import type { ImportResult, SoImportRow } from "@/lib/import";

const COLUMNS = ["so_no", "so_date", "debtor_code", "customer_name", "phone", "address", "branch", "remarks", "item_code", "description", "uom", "qty"];

export default function ImportPage() {
  const [rows, setRows] = useState<SoImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File) {
    setResult(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/[\s.]+/g, "_"),
      complete: (res) => setRows(res.data as unknown as SoImportRow[]),
    });
  }

  const soCount = new Set(rows.map((r) => r.so_no)).size;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import sales orders</h1>
        <p className="text-sm text-slate-500">
          Upload a CSV with one row per item. Re-uploading the same SO number updates it instead of duplicating.
        </p>
      </div>

      <label className="card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed p-10 text-center hover:border-brand-600 hover:bg-brand-50/40">
        <span className="text-3xl">📄</span>
        <span className="font-medium">{fileName || "Choose a CSV file"}</span>
        <span className="text-xs text-slate-500">
          Columns: {COLUMNS.join(", ")} ·{" "}
          <a href="/sample-sales-orders.csv" download className="font-medium text-brand-700" onClick={(e) => e.stopPropagation()}>
            download template
          </a>
        </span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <p className="text-sm">
              <span className="font-semibold">{soCount}</span> sales orders · {rows.length} item rows
            </p>
            <button
              disabled={pending}
              className="btn-primary"
              onClick={() => start(async () => setResult(await importSalesOrders(rows, "csv")))}
            >
              {pending ? "Importing…" : "Import"}
            </button>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>{COLUMNS.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    {COLUMNS.map((c) => (
                      <td key={c} className="max-w-48 truncate whitespace-nowrap px-3 py-1.5">
                        {String((r as Record<string, unknown>)[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="card space-y-2 p-5 text-sm">
          <p className="font-semibold">Import finished</p>
          <p className="text-emerald-700">✓ {result.created.length} created · {result.updated.length} updated</p>
          {result.itemsLocked.length > 0 && (
            <p className="text-amber-700">
              Items not changed (already have DOs): {result.itemsLocked.join(", ")}
            </p>
          )}
          {result.errors.length > 0 && (
            <ul className="list-inside list-disc text-rose-700">
              {result.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
