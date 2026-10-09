/**
 * The company's branches and how AutoCount names them. Users' profiles.branch
 * and the branch columns on SOs/DOs store the `code`.
 *
 * - doPrefix:  DO numbers start with it (GPD-00044524 → GP delivers it)
 * - soPrefix:  SO numbers start with it
 * - locations: AutoCount "Sales Location" / "Agent" values that mean this branch
 * - store:     the store's address; delivery distance (and driver points) is measured from here
 */
export const BRANCHES = [
  {
    code: "GP", name: "Gelang Patah", doPrefix: "GPD", soPrefix: "GPS", locations: ["GPS", "GP"],
    store: "Lot 261 Mukim Jelutong, Jalan Ulu Choh, 81550 Gelang Patah, Johor",
  },
  {
    // TODO: Pandan store address — until it's set, PD deliveries need points keyed in on Driver status.
    code: "PD", name: "Pandan", doPrefix: "PDD", soPrefix: "PDS", locations: ["PD", "PDS"],
    store: "Jalan Kangkar Tebrau, Kangkar Tebrau Baru, 81100 Johor Bahru, Johor Darul Ta'zim",
  },
  {
    code: "KS", name: "Kempas", doPrefix: "KSD", soPrefix: "KSS", locations: ["KP", "KS", "KSS"],
    store: "Lot 44565, Jalan Kempas Baru, Kempas Baru, 81300 Johor Bahru, Johor",
  },
  {
    code: "MS", name: "Masai", doPrefix: "MSD", soPrefix: "MSS", locations: ["MS", "MSS"],
    store: "Jalan Besar, Kampung Pertanian, 81750 Pasir Gudang, Johor",
  },
  {
    code: "PT", name: "Pontian", doPrefix: "PTD", soPrefix: "PTS", locations: ["PT", "PTS"],
    store: "J46, Jalan Ulu Pulai, Kampung Parit Kassim, 82000 Pontian, Johor",
  },
  // Delivered by the supplier; kept so the selling branch can still follow it.
  { code: "NB2", name: "NB2 (supplier delivery)", doPrefix: "NBD", soPrefix: "NBS", locations: ["NB2", "NB"], store: null },
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

export function storeAddress(code: string | null | undefined): string | null {
  return BRANCHES.find((b) => b.code === code)?.store ?? null;
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

/**
 * Only the delivering branch plans a DO (driver, trip, date). Staff without a
 * branch (e.g. head office) can plan any DO, and so can anyone for a DO with no branch.
 */
export function canPlan(userBranch: string | null | undefined, doBranch: string | null | undefined): boolean {
  return !userBranch || !doBranch || userBranch === doBranch;
}

/**
 * Dispatchers with a branch only ever see that branch: DOs it delivers, plus
 * DOs its agents sold that another branch delivers. Admins (and staff without
 * a branch) see every branch. Returns the branch they're kept to, or null.
 */
export function lockedBranch(profile: { role: string; branch: string | null }): string | null {
  return profile.role === "dispatcher" && profile.branch ? profile.branch : null;
}

/** PostgREST filter for "this branch delivers it or sold it". */
export const deliveredOrSoldBy = (branch: string) => `branch.eq.${branch},sales_branch.eq.${branch}`;
