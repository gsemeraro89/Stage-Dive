// The database's usage this billing period (Neon), for the daily usage watch (scripts/db-usage.ts,
// .github/workflows/db-usage.yml). On 21 Nov 2026 the free plan's data transfer ran out in 3 days and the
// site went down; on the paid plan the risk is the bill, so the watch fails (GitHub emails the owner)
// when compute or data transfer passes a budget. Pure functions, tested in tests/db-usage.test.ts.

export const NEON_API = "https://console.neon.tech/api/v2";

/** The fields of GET /projects/{id} this watch reads (Neon API v2). */
export interface NeonProjectUsage {
  data_transfer_bytes?: number;
  compute_time_seconds?: number;
  active_time_seconds?: number;
  synthetic_storage_size?: number;
  consumption_period_start?: string;
  consumption_period_end?: string;
}

export interface UsageBudget {
  /** Most compute this period, in compute-unit hours (1 CU for 1 hour). */
  computeHours: number;
  /** Most data sent from the database this period, in GB (10^9 bytes). */
  transferGb: number;
}

export const DEFAULT_BUDGET: UsageBudget = { computeHours: 60, transferGb: 50 };

/** The budget from the environment (NEON_COMPUTE_BUDGET_HOURS, NEON_TRANSFER_BUDGET_GB), defaults otherwise. */
export function budgetFromEnv(env: Record<string, string | undefined>): UsageBudget {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    computeHours: num(env.NEON_COMPUTE_BUDGET_HOURS, DEFAULT_BUDGET.computeHours),
    transferGb: num(env.NEON_TRANSFER_BUDGET_GB, DEFAULT_BUDGET.transferGb),
  };
}

export interface UsageReport {
  periodStart: Date | null;
  periodEnd: Date | null;
  transferGb: number;
  computeHours: number;
  activeHours: number;
  storageGb: number;
  /** Share of the period gone, 0..1 (null when Neon gives no period). */
  elapsed: number | null;
  /** Where compute and transfer end up at this pace by the end of the period (null early in the period). */
  projected: { computeHours: number; transferGb: number } | null;
  /** Budgets passed: the job fails. */
  over: string[];
  /** Budgets that will be passed at this pace: a warning only. */
  heading: string[];
  lines: string[];
}

const GB = 1e9;
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const date = (s: string | undefined) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Read the project's figures against the budget. */
export function usageReport(project: NeonProjectUsage, budget: UsageBudget, now = new Date()): UsageReport {
  const periodStart = date(project.consumption_period_start);
  const periodEnd = date(project.consumption_period_end);
  const transferGb = (project.data_transfer_bytes ?? 0) / GB;
  const computeHours = (project.compute_time_seconds ?? 0) / 3600;
  const activeHours = (project.active_time_seconds ?? 0) / 3600;
  const storageGb = (project.synthetic_storage_size ?? 0) / GB;

  const span = periodStart && periodEnd ? periodEnd.getTime() - periodStart.getTime() : 0;
  const elapsed = span > 0 ? Math.min(1, Math.max(0, (now.getTime() - periodStart!.getTime()) / span)) : null;
  // Under a day in, a projection says little.
  const projected =
    elapsed !== null && periodStart && now.getTime() - periodStart.getTime() >= 86_400_000
      ? { computeHours: computeHours / elapsed, transferGb: transferGb / elapsed }
      : null;

  const over: string[] = [];
  const heading: string[] = [];
  if (computeHours > budget.computeHours) over.push(`compute ${round(computeHours)} CU-hours is above the budget of ${budget.computeHours}`);
  else if (projected && projected.computeHours > budget.computeHours)
    heading.push(`compute heads for about ${round(projected.computeHours, 0)} CU-hours this period (budget ${budget.computeHours})`);
  if (transferGb > budget.transferGb) over.push(`data transfer ${round(transferGb)} GB is above the budget of ${budget.transferGb} GB`);
  else if (projected && projected.transferGb > budget.transferGb)
    heading.push(`data transfer heads for about ${round(projected.transferGb, 1)} GB this period (budget ${budget.transferGb} GB)`);

  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "?");
  const lines = [
    `Database usage (Neon) from ${day(periodStart)} to ${day(periodEnd)}${elapsed !== null ? `, ${Math.round(elapsed * 100)}% of the period gone` : ""}:`,
    `- Data transfer (sent by the database): ${round(transferGb, 3)} GB of a ${budget.transferGb} GB budget${projected ? ` (about ${round(projected.transferGb, 1)} GB at this pace)` : ""}`,
    `- Compute: ${round(computeHours)} CU-hours of a ${budget.computeHours} CU-hour budget${projected ? ` (about ${round(projected.computeHours, 0)} at this pace)` : ""}; awake ${round(activeHours, 1)} hours`,
    `- Storage: ${round(storageGb, 3)} GB`,
  ];
  return { periodStart, periodEnd, transferGb, computeHours, activeHours, storageGb, elapsed, projected, over, heading, lines };
}

/** Read the project from the Neon API. Throws with the HTTP status when Neon says no. */
export async function fetchNeonProject(projectId: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<NeonProjectUsage> {
  const res = await fetchImpl(`${NEON_API}/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Neon API answered ${res.status} ${res.statusText} for project ${projectId}`);
  const body = (await res.json()) as { project?: NeonProjectUsage };
  if (!body.project) throw new Error("Neon API answer has no project");
  return body.project;
}
