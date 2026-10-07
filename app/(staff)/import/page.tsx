"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { importAutoCount } from "@/app/actions";
import { parseAutoCountSheet, type AcImport, type AcImportResult } from "@/lib/autocount-rows";
import { fmtDate } from "@/lib/format";

const KIND_LABEL = { so: "sales orders", do: "delivery orders" };

export default function ImportPage() {
  const [parsed, setParsed] = useState<AcImport | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<AcImportResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setResult(null);
    setFailed(null);
    setParseError(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const isCsv = /\.csv$/i.test(file.name);
      // CSV: keep cells as text so dates stay day-first (06/10/2026 = 6 Oct).
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: isCsv });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null });
      const res = parseAutoCountSheet(rows);
      if ("error" in res) setParseError(res.error);
      else if (res.rows.length === 0) setParseError("No documents found in this file.");
      else setParsed(res);
    } catch {
      setParseError("Could not read this file. Use the .xlsx or .csv exported from AutoCount.");
    }
  }

  function runImport() {
    if (!parsed) return;
    start(async () => {
      try {
        setResult(await importAutoCount(parsed));
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import from AutoCount</h1>
        <p className="text-sm text-slate-500">
          Upload the Sales Order or Delivery Order listing exported from AutoCount (.xlsx or .csv). The file type is detected
          automatically. Importing the same documents again updates them — driver, trip and delivery status set here are kept.
        </p>
      </div>

      <label className="card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed p-10 text-center hover:border-brand-600 hover:bg-brand-50/40">
        <span className="text-3xl">📄</span>
        <span className="font-medium">{fileName || "Choose an AutoCount SO or DO file"}</span>
        <span className="text-xs text-slate-500">
          SO needs: Doc. No., Date, Debtor Name, Transfer To … · DO needs: Doc. No., Date, Debtor Name, Transfer From …
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {parseError && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{parseError}</p>}

      {parsed && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <p className="text-sm">
              Detected <span className="font-semibold">{parsed.rows.length} {KIND_LABEL[parsed.kind]}</span>
            </p>
            <button disabled={pending} className="btn-primary" onClick={runImport}>
              {pending ? "Importing…" : `Import ${parsed.rows.length} ${KIND_LABEL[parsed.kind]}`}
            </button>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Doc. No.</th>
                  <th className="whitespace-nowrap px-3 py-2">Date</th>
                  <th className="whitespace-nowrap px-3 py-2">Debtor</th>
                  <th className="whitespace-nowrap px-3 py-2">{parsed.kind === "so" ? "Transfer To (DO)" : "Transfer From (SO)"}</th>
                  <th className="whitespace-nowrap px-3 py-2">Delivery address</th>
                  <th className="whitespace-nowrap px-3 py-2">{parsed.kind === "so" ? "Remark 1" : "Ref."}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsed.rows.slice(0, 100).map((r) => (
                  <tr key={r.doc_no} className={"cancelled" in r && r.cancelled ? "text-slate-400 line-through" : ""}>
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium">{r.doc_no}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{fmtDate(r.date)}</td>
                    <td className="max-w-56 truncate px-3 py-1.5">{r.debtor_name}</td>
                    <td className="max-w-56 truncate px-3 py-1.5">{parsed.kind === "so" ? (r as { transfer_to: string | null }).transfer_to : (r as { transfer_from: string | null }).transfer_from}</td>
                    <td className="max-w-64 truncate px-3 py-1.5">{r.delivery_address}</td>
                    <td className="max-w-56 truncate px-3 py-1.5">{parsed.kind === "so" ? (r as { remark: string | null }).remark : (r as { ref: string | null }).ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.rows.length > 100 && <p className="px-3 py-2 text-xs text-slate-400">Showing the first 100.</p>}
          </div>
        </div>
      )}

      {failed && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{failed}</p>}

      {result && (
        <div className="card space-y-2 p-5 text-sm">
          <p className="font-semibold">Import finished</p>
          <p className="text-emerald-700">✓ {result.created.length} new · {result.updated.length} updated</p>
          {result.warnings.length > 0 && (
            <ul className="list-inside list-disc text-amber-700">
              {result.warnings.slice(0, 30).map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          {result.errors.length > 0 && (
            <ul className="list-inside list-disc text-rose-700">
              {result.errors.slice(0, 30).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <p className="text-xs text-slate-500">
            Tip: import both the SO and the DO file — in any order — so every DO is linked to its SOs.
          </p>
        </div>
      )}
    </div>
  );
}
