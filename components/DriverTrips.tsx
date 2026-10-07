"use client";

import { useEffect, useState, useTransition } from "react";
import { moveToTrip } from "@/app/actions";
import { DoBadge } from "./StatusBadge";
import { BranchTags, SoLinks } from "./DocLinks";
import { fmtDate } from "@/lib/format";
import type { DeliveryOrder, DoStatus } from "@/lib/types";

type Driver = { id: string; full_name: string; branch: string | null; lorry_no: string | null };
type Lane = { driverId: string; date: string; tripNo: number };

/** Orders already on the road or delivered stay where they are. */
const LOCKED: DoStatus[] = ["out_for_delivery", "delivered"];

const laneKey = (l: Lane) => `${l.driverId}|${l.date}|${l.tripNo}`;
const inLane = (j: DeliveryOrder, l: Lane) => j.driver_id === l.driverId && j.delivery_date === l.date && j.trip_no === l.tripNo;
const bySeq = (a: DeliveryOrder, b: DeliveryOrder) => a.trip_seq - b.trip_seq;

export function DriverTrips({ drivers, dates, jobs: initial }: { drivers: Driver[]; dates: string[]; jobs: DeliveryOrder[] }) {
  const [jobs, setJobs] = useState(initial);
  useEffect(() => setJobs(initial), [initial]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null); // lane key or order id under the cursor
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function drop(lane: Lane, beforeId: string | null) {
    const id = dragId;
    setDragId(null);
    setOver(null);
    const moved = jobs.find((j) => j.id === id);
    if (!moved || beforeId === id) return;

    const target = jobs.filter((j) => j.id !== moved.id && inLane(j, lane)).sort(bySeq);
    const at = beforeId ? target.findIndex((j) => j.id === beforeId) : -1;
    target.splice(at < 0 ? target.length : at, 0, {
      ...moved,
      driver_id: lane.driverId,
      delivery_date: lane.date,
      trip_no: lane.tripNo,
    });

    const before = jobs;
    setJobs(jobs.filter((j) => j.id !== moved.id && !inLane(j, lane)).concat(target.map((j, i) => ({ ...j, trip_seq: i }))));
    setError(null);
    start(async () => {
      try {
        await moveToTrip({ doId: moved.id, ...lane, orderedIds: target.map((j) => j.id) });
      } catch (e) {
        setJobs(before);
        setError(e instanceof Error ? e.message : "Could not move the order");
      }
    });
  }

  function renderLane(lane: Lane, laneJobs: DeliveryOrder[], isNew: boolean) {
    const key = laneKey(lane);
    const delivered = laneJobs.filter((j) => j.status === "delivered").length;
    return (
      <div
        key={key}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          setOver(key);
        }}
        onDrop={(e) => {
          e.preventDefault();
          drop(lane, null);
        }}
        className={`flex w-64 shrink-0 flex-col rounded-xl p-2 transition ${
          isNew ? "border-2 border-dashed border-slate-200" : "bg-slate-100/70"
        } ${over === key ? "ring-2 ring-brand-600" : ""}`}
      >
        <div className="flex items-center justify-between px-1 pb-2 text-xs font-semibold text-slate-600">
          <span>{isNew ? `+ Trip ${lane.tripNo}` : `Trip ${lane.tripNo}`}</span>
          {!isNew && <span className="font-normal text-slate-400">{delivered}/{laneJobs.length} delivered</span>}
        </div>
        <div className="flex min-h-12 flex-1 flex-col gap-2">
          {laneJobs.map((j, i) => {
            const locked = LOCKED.includes(j.status);
            return (
              <article
                key={j.id}
                draggable={!locked}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", j.id);
                  setDragId(j.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOver(null);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setOver(j.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  drop(lane, j.id);
                }}
                className={`card space-y-1 p-2.5 text-xs ${
                  locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                } ${j.status === "delivered" ? "opacity-60" : ""} ${dragId === j.id ? "opacity-40" : ""} ${
                  over === j.id && dragId !== j.id ? "border-t-4 border-t-brand-600" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    <span className="mr-1 text-slate-400">{i + 1}.</span>
                    {j.do_no}
                  </span>
                  <DoBadge status={j.status} />
                </div>
                <p className="text-sm font-medium leading-snug">{j.customer_name}</p>
                {j.address && <p className="line-clamp-2 text-slate-500">{j.address}</p>}
                {j.remarks && <p className="line-clamp-2 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{j.remarks}</p>}
                <div className="flex items-center justify-between gap-2 text-slate-400">
                  <span className="whitespace-nowrap">{j.do_items?.length ?? 0} items</span>
                  <SoLinks job={j} className="truncate text-right" />
                </div>
                <BranchTags job={j} />
                {j.status === "failed" && j.failed_reason && <p className="text-rose-600">{j.failed_reason}</p>}
              </article>
            );
          })}
          {laneJobs.length === 0 && (
            <p className="py-3 text-center text-xs text-slate-400">{isNew ? "Drop here for a new trip" : "Drop orders here"}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
      {pending && <p className="text-xs text-slate-400">Saving…</p>}

      {drivers.map((d) => {
        const mine = jobs.filter((j) => j.driver_id === d.id);
        const done = mine.filter((j) => j.status === "delivered").length;
        return (
          <section key={d.id} className="card overflow-hidden">
            <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
              <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                {d.full_name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2 className="flex items-center gap-2 font-semibold leading-tight">
                  {d.full_name}
                  {d.lorry_no && (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Lorry {d.lorry_no}</span>
                  )}
                </h2>
                {d.branch && <p className="text-xs text-slate-500">{d.branch}</p>}
              </div>
              <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
                <span>{done} of {mine.length} delivered</span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${mine.length ? (done / mine.length) * 100 : 0}%` }} />
                </div>
              </div>
            </header>
            <div className="divide-y divide-slate-100">
              {dates.map((date) => {
                const day = mine.filter((j) => j.delivery_date === date);
                const trips = [...new Set(day.map((j) => j.trip_no))].sort((a, b) => a - b);
                if (trips.length === 0) trips.push(1);
                const next = trips[trips.length - 1] + 1;
                return (
                  <div key={date} className="flex flex-col gap-2 px-4 py-3 md:flex-row">
                    <p className="w-28 shrink-0 text-sm font-medium text-slate-600">{fmtDate(date)}</p>
                    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
                      {trips.map((t) => {
                        const lane = { driverId: d.id, date, tripNo: t };
                        return renderLane(lane, day.filter((j) => j.trip_no === t).sort(bySeq), false);
                      })}
                      {day.length > 0 && renderLane({ driverId: d.id, date, tripNo: next }, [], true)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
