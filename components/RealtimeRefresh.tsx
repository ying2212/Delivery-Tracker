"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Re-renders the page whenever a row in `table` changes (e.g. a driver marks a job delivered). */
export function RealtimeRefresh({ table }: { table: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`refresh-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, router]);
  return null;
}
