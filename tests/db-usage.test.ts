// The daily database usage watch (src/lib/db-usage.ts): figures read right, budgets enforced.
import { describe, expect, it } from "vitest";
import { budgetFromEnv, DEFAULT_BUDGET, fetchNeonProject, usageReport } from "../src/lib/db-usage";

const project = {
  data_transfer_bytes: 12_500_000_000,
  compute_time_seconds: 30 * 3600,
  active_time_seconds: 120 * 3600,
  synthetic_storage_size: 33_000_000,
  consumption_period_start: "2026-12-01T00:00:00Z",
  consumption_period_end: "2027-01-01T00:00:00Z",
};

describe("database usage watch", () => {
  it("reads the budget from the environment, defaults otherwise", () => {
    expect(budgetFromEnv({})).toEqual(DEFAULT_BUDGET);
    expect(DEFAULT_BUDGET).toEqual({ computeHours: 60, transferGb: 50 });
    expect(budgetFromEnv({ NEON_COMPUTE_BUDGET_HOURS: "100", NEON_TRANSFER_BUDGET_GB: "10" })).toEqual({ computeHours: 100, transferGb: 10 });
    expect(budgetFromEnv({ NEON_COMPUTE_BUDGET_HOURS: "", NEON_TRANSFER_BUDGET_GB: "lots" })).toEqual(DEFAULT_BUDGET);
  });

  it("turns Neon's figures into hours and GB, within budget", () => {
    const r = usageReport(project, DEFAULT_BUDGET, new Date("2026-12-31T00:00:00Z"));
    expect(r.transferGb).toBeCloseTo(12.5);
    expect(r.computeHours).toBe(30);
    expect(r.activeHours).toBe(120);
    expect(r.over).toEqual([]);
    expect(r.heading).toEqual([]);
    expect(r.lines.join("\n")).toContain("12.5 GB of a 50 GB budget");
  });

  it("fails when compute or transfer passes the budget", () => {
    const r = usageReport({ ...project, compute_time_seconds: 61 * 3600, data_transfer_bytes: 51e9 }, DEFAULT_BUDGET, new Date("2026-12-20T00:00:00Z"));
    expect(r.over).toHaveLength(2);
    expect(r.over[0]).toContain("compute 61 CU-hours");
    expect(r.over[1]).toContain("data transfer 51 GB");
  });

  it("warns, without failing, when the pace heads above the budget", () => {
    // 30 CU-hours after 10 of 31 days: about 93 by the end.
    const r = usageReport(project, DEFAULT_BUDGET, new Date("2026-12-11T00:00:00Z"));
    expect(r.over).toEqual([]);
    expect(r.heading).toHaveLength(1);
    expect(r.heading[0]).toContain("compute heads for about 93");
  });

  it("makes no projection in the first day, and copes with missing fields", () => {
    expect(usageReport(project, DEFAULT_BUDGET, new Date("2026-12-01T12:00:00Z")).projected).toBeNull();
    const empty = usageReport({}, DEFAULT_BUDGET);
    expect(empty.computeHours).toBe(0);
    expect(empty.elapsed).toBeNull();
    expect(empty.over).toEqual([]);
  });

  it("asks the project endpoint with the key and reads the project", async () => {
    let seen: { url: string; auth: string } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, auth: (init.headers as Record<string, string>).Authorization };
      return new Response(JSON.stringify({ project }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchNeonProject("green-shape-12818603", "k", fake)).toEqual(project);
    expect(seen).toEqual({ url: "https://console.neon.tech/api/v2/projects/green-shape-12818603", auth: "Bearer k" });
    const denied = (async () => new Response("no", { status: 401, statusText: "Unauthorized" })) as unknown as typeof fetch;
    await expect(fetchNeonProject("p", "bad", denied)).rejects.toThrow("401");
  });
});
