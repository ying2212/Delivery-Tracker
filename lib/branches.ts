/**
 * The company's branches and how AutoCount names them. Users' profiles.branch
 * and the branch columns on SOs/DOs store the `code`.
 *
 * - doPrefix:  DO numbers start with it (GPD-00044524 → GP delivers it)
 * - soPrefix:  SO numbers start with it
 * - locations: AutoCount "Sales Location" / "Agent" values that mean this branch
 */
export const BRANCHES = [
  { code: "GP", name: "Gelang Patah", doPrefix: "GPD", soPrefix: "GPS", locations: ["GPS", "GP"] },
  { code: "PD", name: "Pandan", doPrefix: "PDD", soPrefix: "PDS", locations: ["PD", "PDS"] },
  { code: "KS", name: "Kempas", doPrefix: "KSD", soPrefix: "KSS", locations: ["KP", "KS", "KSS"] },
  { code: "MS", name: "Masai", doPrefix: "MSD", soPrefix: "MSS", locations: ["MS", "MSS"] },
  { code: "PT", name: "Pontian", doPrefix: "PTD", soPrefix: "PTS", locations: ["PT", "PTS"] },
  // Delivered by the supplier; kept so the selling branch can still follow it.
  { code: "NB2", name: "NB2 (supplier delivery)", doPrefix: "NBD", soPrefix: "NBS", locations: ["NB2", "NB"] },
] as const;

const prefixOf = (docNo: string) => docNo.trim().toUpperCase().split("-")[0];

/** Branch that delivers a DO, from its number: "PDD-00045420" → "PD". */
export function branchFromDoNo(doNo: string): string | null {
  const p = prefixOf(doNo);
  return BRANCHES.find((b) => b.doPrefix === p)?.code ?? null;
}

/** Branch from an AutoCount Sales Location / Agent value ("GPS", "KP", …), else from the SO number. */
export function branchFromLocation(location: string | null | undefined, soNo?: string): string | null {
  const loc = location?.trim().toUpperCase();
  const byLoc = loc ? BRANCHES.find((b) => (b.locations as readonly string[]).includes(loc)) : undefined;
  if (byLoc) return byLoc.code;
  const p = soNo ? prefixOf(soNo) : "";
  return BRANCHES.find((b) => b.soPrefix === p)?.code ?? null;
}

export function branchName(code: string | null | undefined): string {
  return BRANCHES.find((b) => b.code === code)?.name ?? code ?? "";
}

/**
 * Which branch a staff page shows. No ?branch= in the URL → the user's own
 * branch; ?branch=all → every branch (returns ""); otherwise that branch.
 */
export function pickBranch(param: string | undefined, own: string | null): string {
  if (param === undefined) return own ?? "";
  return param === "all" ? "" : param;
}
