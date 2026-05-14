import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRawUnsafe: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    $queryRawUnsafe: mocks.queryRawUnsafe,
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/runtime-paths", () => ({
  getCortanaSourceRepo: () => "/repo/cortana",
}));

vi.mock("@/lib/script-env", () => ({
  loadMissionControlScriptEnv: vi.fn(() => ({})),
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mocks.readFileSync,
  },
  readFileSync: mocks.readFileSync,
}));

const config = {
  version: 1,
  timezone: "America/New_York",
  summaryTimes: { morning: "08:00", evening: "20:00" },
  pausedJobIds: [],
  remediationLadder: [],
  systems: {
    mission_control: {
      tier: 0,
      required: true,
      probe: "mission-control",
      freshnessSource: "heartbeat",
      remediation: [],
    },
  },
};

const windowRow = {
  id: 42n,
  label: "vacation-2026-05-14",
  status: "ready",
  timezone: "America/New_York",
  start_at: new Date("2026-05-14T12:00:00.000Z"),
  end_at: new Date("2026-05-21T12:00:00.000Z"),
  prep_recommended_at: null,
  prep_started_at: null,
  prep_completed_at: null,
  enabled_at: null,
  disabled_at: null,
  disable_reason: null,
  trigger_source: "manual",
  created_by: "hamel",
  config_snapshot: {},
  state_snapshot: {},
  created_at: new Date("2026-05-14T11:00:00.000Z"),
  updated_at: new Date("2026-05-14T11:30:00.000Z"),
};

const runRow = {
  id: 91n,
  vacation_window_id: 42n,
  run_type: "readiness",
  trigger_source: "manual",
  dry_run: false,
  readiness_outcome: "pass",
  summary_status: null,
  summary_payload: {},
  summary_text: "ready",
  started_at: new Date("2026-05-14T11:20:00.000Z"),
  completed_at: new Date("2026-05-14T11:21:00.000Z"),
  state: "completed",
};

describe("getVacationOpsSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readFileSync.mockImplementation((target: string) => {
      if (target.endsWith("vacation-ops.json")) return JSON.stringify(config);
      if (target.endsWith("jobs.json")) return JSON.stringify({ jobs: [] });
      throw Object.assign(new Error(`missing ${target}`), { code: "ENOENT" });
    });
  });

  it("normalizes Postgres bigint ids before JSON serialization", async () => {
    mocks.queryRawUnsafe
      .mockResolvedValueOnce([windowRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow])
      .mockResolvedValueOnce([runRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 101n,
          run_id: 91n,
          system_key: "mission_control",
          tier: 0n,
          status: "green",
          observed_at: new Date("2026-05-14T11:20:30.000Z"),
          freshness_at: null,
          remediation_attempted: false,
          remediation_succeeded: false,
          detail: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 201n,
          vacation_window_id: 42n,
          run_id: 91n,
          latest_check_result_id: 101n,
          latest_action_id: null,
          system_key: "mission_control",
          tier: 0n,
          status: "resolved",
          human_required: false,
          first_observed_at: new Date("2026-05-14T11:20:30.000Z"),
          last_observed_at: new Date("2026-05-14T11:21:30.000Z"),
          resolved_at: new Date("2026-05-14T11:21:30.000Z"),
          resolution_reason: "remediated",
          symptom: null,
          detail: {},
          created_at: new Date("2026-05-14T11:20:30.000Z"),
          updated_at: new Date("2026-05-14T11:21:30.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 301n,
          vacation_window_id: 42n,
          run_id: 91n,
          system_key: "mission_control",
          step_order: 1n,
          action_kind: "verify",
          action_status: "completed",
          verification_status: "passed",
          started_at: new Date("2026-05-14T11:21:00.000Z"),
          completed_at: new Date("2026-05-14T11:21:30.000Z"),
          detail: {},
        },
      ]);

    const { getVacationOpsSnapshot } = await import("@/lib/vacation-ops");
    const snapshot = await getVacationOpsSnapshot();

    expect(snapshot.latestWindow?.id).toBe(42);
    expect(snapshot.latestReadiness?.id).toBe(91);
    expect(snapshot.latestChecks[0]?.id).toBe(101);
    expect(snapshot.recentIncidents[0]?.latestCheckResultId).toBe(101);
    expect(snapshot.recentActions[0]?.stepOrder).toBe(1);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });
});
