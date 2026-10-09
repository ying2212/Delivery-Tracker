"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** A burst of changes (e.g. an import of 300 DOs) causes one refresh, this long after the last change. */
const WAIT_MS = 1000;

/**
 * Re-renders the page whenever a row in `table` changes (e.g. a driver marks a job delivered).
 * `filter` limits it to matching rows, e.g. "branch=eq.GP". Background tabs refresh once when shown again.
 */
export function RealtimeRefresh({ table, filter }: { table: string; filter?: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let missed = false;

    const refresh = () => {
      if (document.hidden) missed = true;
      else router.refresh();
    };
    const onShow = () => {
      if (!document.hidden && missed) {
        missed = false;
        router.refresh();
      }
    };

    const channel = supabase
      .channel(`refresh-${table}-${filter ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, WAIT_MS);
      })
      .subscribe();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
      supabase.removeChannel(channel);
    };
  }, [table, filter, router]);
  return null;
}
