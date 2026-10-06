import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Every branch someone belongs to (profiles.branch), sorted. */
export async function listBranches(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from("profiles").select("branch").not("branch", "is", null);
  return [...new Set((data ?? []).map((r) => r.branch as string))].sort();
}

/**
 * Which branch a staff page shows. No ?branch= in the URL → the user's own
 * branch; ?branch=all → every branch (returns ""); otherwise that branch.
 */
export function pickBranch(param: string | undefined, own: string | null): string {
  if (param === undefined) return own ?? "";
  return param === "all" ? "" : param;
}
