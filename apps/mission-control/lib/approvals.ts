import prisma from "@/lib/prisma";
import { getTaskPrisma } from "@/lib/task-prisma";

export type ApprovalFilters = {
  status?: "pending" | "approved" | "approved_edited" | "rejected" | "expired" | "cancelled" | "all";
  risk_level?: "p0" | "p1" | "p2" | "p3";
  actionType?: string;
  correlationKey?: string;
  rangeHours?: number;
  limit?: number;
};

export type ApprovalEvent = {
  id: number;
  approvalId: string;
  eventType: string;
  actor: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ApprovalRequest = {
  id: string;
  runId: string | null;
  taskId: string | null;
  feedbackId: string | null;
  feedbackSummary: string | null;
  agentId: string;
  actionType: string;
  proposal: Record<string, unknown>;
  diff: Record<string, unknown> | null;
  rationale: string | null;
  riskLevel: "p0" | "p1" | "p2" | "p3";
  riskScore: number | null;
  blastRadius: string | null;
  autoApprovable: boolean;
  policyVersion: string | null;
  status: string;
  decision: Record<string, unknown> | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  resumedAt: string | null;
  executedAt: string | null;
  executionResult: Record<string, unknown> | null;
  resumePayload: Record<string, unknown> | null;
  eventCount: number;
  latestEventAt: string | null;
  events?: ApprovalEvent[];
};

type ApprovalRow = {
  id: string;
  run_id: string | null;
  task_id: string | null;
  feedback_id: string | null;
  feedback_summary: string | null;
  agent_id: string;
  action_type: string;
  proposal: unknown;
  diff: unknown;
  rationale: string | null;
  risk_level: "p0" | "p1" | "p2" | "p3";
  risk_score: number | null;
  blast_radius: string | null;
  auto_approvable: boolean;
  policy_version: string | null;
  status: string;
  decision: unknown;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  created_at: Date;
  expires_at: Date | null;
  resumed_at: Date | null;
  executed_at: Date | null;
  execution_result: unknown;
  resume_payload: unknown;
  event_count: number;
  latest_event_at: Date | null;
};

type ApprovalEventRow = {
  id: number;
  approval_id: string;
  event_type: string;
  actor: string | null;
  payload: unknown;
  created_at: Date;
};

type CreateApprovalInput = {
  agentId: string;
  actionType: string;
  proposal: Record<string, unknown>;
  rationale?: string | null;
  riskLevel: "p0" | "p1" | "p2" | "p3";
  blastRadius?: string | null;
  resumePayload?: Record<string, unknown> | null;
  runId?: string | null;
  taskId?: string | null;
};

export type ApprovalSignalState = "pending" | "cleared";

export type ApprovalSignalResult = {
  approval: ApprovalRequest | null;
  state: "created" | "existing" | "cancelled" | "noop";
};

type ApprovalSignalRow = {
  id: string;
  status: string;
  executed_at: Date | null;
};

const normalizeObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const asNullableObject = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
};

const escapeLiteral = (value: string) => value.replaceAll("'", "''");
const asJsonbLiteral = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const clampApprovalRangeHours = (rangeHours?: number) =>
  Math.max(1, Math.min(rangeHours ?? 24 * 90, 24 * 90));
const approvalStatusSql = (alias = "r") =>
  `CASE WHEN ${alias}.status = 'pending' AND ${alias}.expires_at IS NOT NULL AND ${alias}.expires_at < NOW() THEN 'expired' ELSE ${alias}.status END`;

const mapApproval = (row: ApprovalRow): ApprovalRequest => ({
  id: row.id,
  runId: row.run_id,
  taskId: row.task_id,
  feedbackId: row.feedback_id ?? null,
  feedbackSummary: row.feedback_summary ?? null,
  agentId: row.agent_id,
  actionType: row.action_type,
  proposal: normalizeObject(row.proposal),
  diff: asNullableObject(row.diff),
  rationale: row.rationale,
  riskLevel: row.risk_level,
  riskScore: row.risk_score == null ? null : Number(row.risk_score),
  blastRadius: row.blast_radius,
  autoApprovable: row.auto_approvable,
  policyVersion: row.policy_version,
  status: row.status,
  decision: asNullableObject(row.decision),
  approvedBy: row.approved_by,
  approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
  rejectedBy: row.rejected_by,
  rejectedAt: row.rejected_at ? row.rejected_at.toISOString() : null,
  createdAt: row.created_at.toISOString(),
  expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
  resumedAt: row.resumed_at ? row.resumed_at.toISOString() : null,
  executedAt: row.executed_at ? row.executed_at.toISOString() : null,
  executionResult: asNullableObject(row.execution_result),
  resumePayload: asNullableObject(row.resume_payload),
  eventCount: Number(row.event_count || 0),
  latestEventAt: row.latest_event_at ? row.latest_event_at.toISOString() : null,
});

const mapEvent = (row: ApprovalEventRow): ApprovalEvent => ({
  id: Number(row.id),
  approvalId: row.approval_id,
  eventType: row.event_type,
  actor: row.actor,
  payload: normalizeObject(row.payload),
  createdAt: row.created_at.toISOString(),
});

export async function getApprovals(filters: ApprovalFilters = {}): Promise<ApprovalRequest[]> {
  const taskPrisma = getTaskPrisma();
  const preferred = taskPrisma ?? prisma;

  const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));
  const rangeHours = clampApprovalRangeHours(filters.rangeHours);
  const statusSql = approvalStatusSql("r");

  const conditions: string[] = [
    `r.created_at >= NOW() - INTERVAL '${rangeHours} hours'`,
  ];

  if (filters.status && filters.status !== "all") {
    conditions.push(`${statusSql} = '${escapeLiteral(filters.status)}'`);
  }

  if (filters.risk_level) {
    conditions.push(`r.risk_level = '${escapeLiteral(filters.risk_level)}'`);
  }

  if (filters.actionType) {
    conditions.push(`r.action_type = '${escapeLiteral(filters.actionType)}'`);
  }

  if (filters.correlationKey) {
    conditions.push(`r.proposal->>'correlation_key' = '${escapeLiteral(filters.correlationKey)}'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      r.id,
      r.run_id,
      r.task_id,
      MAX(r.proposal->>'feedback_id') AS feedback_id,
      MAX(f.summary) AS feedback_summary,
      r.agent_id,
      r.action_type,
      r.proposal,
      r.diff,
      r.rationale,
      r.risk_level,
      r.risk_score,
      r.blast_radius,
      r.auto_approvable,
      r.policy_version,
      ${statusSql} AS status,
      r.decision,
      r.approved_by,
      r.approved_at,
      r.rejected_by,
      r.rejected_at,
      r.created_at,
      r.expires_at,
      r.resumed_at,
      r.executed_at,
      r.execution_result,
      r.resume_payload,
      COUNT(e.id)::int AS event_count,
      MAX(e.created_at) AS latest_event_at
    FROM mc_approval_requests r
    LEFT JOIN mc_approval_events e ON e.approval_id = r.id
    LEFT JOIN mc_feedback_items f ON f.id::text = r.proposal->>'feedback_id'
    ${whereClause}
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `;

  const runQuery = async (client: typeof prisma) =>
    client.$queryRawUnsafe<ApprovalRow[]>(query);

  try {
    const rows = await runQuery(preferred);
    return rows.map(mapApproval);
  } catch (error) {
    if (!taskPrisma) throw error;
    const rows = await runQuery(prisma);
    return rows.map(mapApproval);
  }
}

export async function getApprovalById(id: string): Promise<ApprovalRequest | null> {
  const safeId = escapeLiteral(id);
  const taskPrisma = getTaskPrisma();
  const preferred = taskPrisma ?? prisma;
  const statusSql = approvalStatusSql("r");

  const approvalQuery = `
    SELECT
      r.id,
      r.run_id,
      r.task_id,
      MAX(r.proposal->>'feedback_id') AS feedback_id,
      MAX(f.summary) AS feedback_summary,
      r.agent_id,
      r.action_type,
      r.proposal,
      r.diff,
      r.rationale,
      r.risk_level,
      r.risk_score,
      r.blast_radius,
      r.auto_approvable,
      r.policy_version,
      ${statusSql} AS status,
      r.decision,
      r.approved_by,
      r.approved_at,
      r.rejected_by,
      r.rejected_at,
      r.created_at,
      r.expires_at,
      r.resumed_at,
      r.executed_at,
      r.execution_result,
      r.resume_payload,
      COUNT(e.id)::int AS event_count,
      MAX(e.created_at) AS latest_event_at
    FROM mc_approval_requests r
    LEFT JOIN mc_approval_events e ON e.approval_id = r.id
    LEFT JOIN mc_feedback_items f ON f.id::text = r.proposal->>'feedback_id'
    WHERE r.id = '${safeId}'
    GROUP BY r.id
    LIMIT 1
  `;

  const eventsQuery = `
    SELECT id, approval_id, event_type, actor, payload, created_at
    FROM mc_approval_events
    WHERE approval_id = '${safeId}'
    ORDER BY created_at ASC
  `;

  const run = async (client: typeof prisma) => {
    const [approvalRows, eventRows] = await Promise.all([
      client.$queryRawUnsafe<ApprovalRow[]>(approvalQuery),
      client.$queryRawUnsafe<ApprovalEventRow[]>(eventsQuery),
    ]);
    return { approvalRows, eventRows };
  };

  try {
    const { approvalRows, eventRows } = await run(preferred);
    if (approvalRows.length === 0) return null;
    return { ...mapApproval(approvalRows[0]), events: eventRows.map(mapEvent) };
  } catch (error) {
    if (!taskPrisma) throw error;
    const { approvalRows, eventRows } = await run(prisma);
    if (approvalRows.length === 0) return null;
    return { ...mapApproval(approvalRows[0]), events: eventRows.map(mapEvent) };
  }
}

export async function createApproval(input: CreateApprovalInput): Promise<ApprovalRequest | null> {
  const taskPrisma = getTaskPrisma();
  const preferred = taskPrisma ?? prisma;

  const safeAgentId = escapeLiteral(input.agentId);
  const safeActionType = escapeLiteral(input.actionType);
  const safeRiskLevel = escapeLiteral(input.riskLevel);
  const safeRationale = input.rationale ? `'${escapeLiteral(input.rationale)}'` : "NULL";
  const safeBlastRadius = input.blastRadius ? `'${escapeLiteral(input.blastRadius)}'` : "NULL";
  const safeRunId = input.runId ? `'${escapeLiteral(input.runId)}'` : "NULL";
  const safeTaskId = input.taskId ? `'${escapeLiteral(input.taskId)}'` : "NULL";
  const proposalJson = asJsonbLiteral(input.proposal);
  const resumePayloadJson = input.resumePayload ? asJsonbLiteral(input.resumePayload) : "NULL";

  const autoApprovable = input.riskLevel === "p3";
  const expiresHours = input.riskLevel === "p0" || input.riskLevel === "p1" ? 24 : 72;
  const initialStatus = autoApprovable ? "approved" : "pending";
  const initialDecision = autoApprovable
    ? asJsonbLiteral({
        reason: "Auto-approved by low-risk policy",
        source: "mission-control-policy",
        risk_level: input.riskLevel,
      })
    : "NULL";
  const approvedBy = autoApprovable ? "'policy:auto-approve'" : "NULL";
  const approvedAt = autoApprovable ? "NOW()" : "NULL";
  const expiresAt = autoApprovable ? "NULL" : `NOW() + INTERVAL '${expiresHours} hours'`;

  const insertSql = `
    INSERT INTO mc_approval_requests (
      run_id, task_id, agent_id, action_type, proposal, rationale, risk_level,
      blast_radius, auto_approvable, status, decision, approved_by, approved_at, created_at, expires_at, resume_payload
    )
    VALUES (
      ${safeRunId}, ${safeTaskId}, '${safeAgentId}', '${safeActionType}', ${proposalJson}, ${safeRationale}, '${safeRiskLevel}',
      ${safeBlastRadius}, ${autoApprovable}, '${initialStatus}', ${initialDecision}, ${approvedBy}, ${approvedAt}, NOW(), ${expiresAt}, ${resumePayloadJson}
    )
    RETURNING id
  `;

  const run = async (client: typeof prisma) => {
    const rows = await client.$queryRawUnsafe<Array<{ id: string }>>(insertSql);
    const createdId = rows?.[0]?.id;
    if (!createdId) return null;

    const eventSql = `
      INSERT INTO mc_approval_events (approval_id, event_type, actor, payload)
      VALUES ('${escapeLiteral(createdId)}', 'created', '${safeAgentId}', ${proposalJson})
    `;
    await client.$executeRawUnsafe(eventSql);

    if (autoApprovable) {
      const autoApprovedEventSql = `
        INSERT INTO mc_approval_events (approval_id, event_type, actor, payload)
        VALUES ('${escapeLiteral(createdId)}', 'auto_approved', 'policy:auto-approve', ${initialDecision})
      `;
      await client.$executeRawUnsafe(autoApprovedEventSql);
    }

    return getApprovalById(createdId);
  };

  try {
    return await run(preferred);
  } catch (error) {
    if (!taskPrisma) throw error;
    return run(prisma);
  }
}

const getLatestApprovalSignalRow = async (
  actionType: string,
  correlationKey: string,
): Promise<ApprovalSignalRow | null> => {
  const sql = `
    SELECT id, status, executed_at
    FROM mc_approval_requests
    WHERE action_type = '${escapeLiteral(actionType)}'
      AND proposal->>'correlation_key' = '${escapeLiteral(correlationKey)}'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const taskPrisma = getTaskPrisma();
  const preferred = taskPrisma ?? prisma;
  const run = async (client: typeof prisma) => client.$queryRawUnsafe<ApprovalSignalRow[]>(sql);

  try {
    const rows = await run(preferred);
    return rows[0] ?? null;
  } catch (error) {
    if (!taskPrisma) throw error;
    const rows = await run(prisma);
    return rows[0] ?? null;
  }
};

export async function cancelApproval(
  id: string,
  actor = "system",
  payload?: Record<string, unknown> | null,
): Promise<void> {
  const safeId = escapeLiteral(id);
  const safeActor = `'${escapeLiteral(actor)}'`;
  const payloadJson = payload ? asJsonbLiteral(payload) : "NULL";

  const updateSql = `
    UPDATE mc_approval_requests
    SET status = 'cancelled'
    WHERE id = '${safeId}' AND status = 'pending'
  `;

  const eventSql = `
    INSERT INTO mc_approval_events (approval_id, event_type, actor, payload)
    VALUES ('${safeId}', 'cancelled', ${safeActor}, ${payloadJson})
  `;

  const taskPrisma = getTaskPrisma();
  const preferred = taskPrisma ?? prisma;

  const run = async (client: typeof prisma) => {
    const updated = await client.$executeRawUnsafe(updateSql);
    if (updated > 0) {
      await client.$executeRawUnsafe(eventSql);
    }
  };

  try {
    await run(preferred);
  } catch (error) {
    if (!taskPrisma) throw error;
    await run(prisma);
  }
}

export async function reconcileApprovalSignal(input: {
  signalState: ApprovalSignalState;
  agentId: string;
  actionType: string;
  correlationKey: string;
  proposal: Record<string, unknown>;
  rationale?: string | null;
  riskLevel: "p0" | "p1" | "p2" | "p3";
  blastRadius?: string | null;
  resumePayload?: Record<string, unknown> | null;
  runId?: string | null;
  taskId?: string | null;
  actor?: string | null;
  clearReason?: string | null;
}): Promise<ApprovalSignalResult> {
  const correlationKey = input.correlationKey.trim();
  if (!correlationKey) {
    throw new Error("correlationKey is required for approval reconciliation");
  }

  const latest = await getLatestApprovalSignalRow(input.actionType, correlationKey);
  if (input.signalState === "cleared") {
    if (!latest || latest.status !== "pending") {
      return {
        approval: latest ? await getApprovalById(latest.id) : null,
        state: "noop",
      };
    }

    await cancelApproval(latest.id, input.actor ?? input.agentId, {
      correlation_key: correlationKey,
      reason: input.clearReason ?? "signal cleared by producer",
    });

    return {
      approval: await getApprovalById(latest.id),
      state: "cancelled",
    };
  }

  if (
    latest &&
    (
      latest.status === "pending" ||
      ((latest.status === "approved" || latest.status === "approved_edited") && latest.executed_at == null)
    )
  ) {
    return {
      approval: await getApprovalById(latest.id),
      state: "existing",
    };
  }

  const approval = await createApproval({
    agentId: input.agentId,
    actionType: input.actionType,
    proposal: {
      ...input.proposal,
      correlation_key: correlationKey,
    },
    rationale: input.rationale ?? null,
    riskLevel: input.riskLevel,
    blastRadius: input.blastRadius ?? null,
    resumePayload: input.resumePayload ?? null,
    runId: input.runId ?? null,
    taskId: input.taskId ?? null,
  });

  return {
    approval,
    state: "created",
  };
}

export async function updateApprovalStatus(
  id: string,
  action: "approve" | "reject" | "approve_edited",
  decision?: Record<string, unknown>,
  actor?: string,
): Promise<void> {
  const safeId = escapeLiteral(id);
  const safeActor = actor ? `'${escapeLiteral(actor)}'` : "NULL";
  const decisionJson = decision ? asJsonbLiteral(decision) : "NULL";

  const status = action === "reject" ? "rejected" : action === "approve_edited" ? "approved_edited" : "approved";

  const updateSql = `
    UPDATE mc_approval_requests
    SET
      status = '${status}',
      decision = COALESCE(${decisionJson}, decision),
      approved_by = CASE WHEN '${status}' IN ('approved','approved_edited') THEN COALESCE(${safeActor}, approved_by) ELSE approved_by END,
      approved_at = CASE WHEN '${status}' IN ('approved','approved_edited') THEN NOW() ELSE approved_at END,
      rejected_by = CASE WHEN '${status}' = 'rejected' THEN COALESCE(${safeActor}, rejected_by) ELSE rejected_by END,
      rejected_at = CASE WHEN '${status}' = 'rejected' THEN NOW() ELSE rejected_at END
    WHERE id = '${safeId}'
  `;

  const eventPayload = decision ? decisionJson : "NULL";
  const eventSql = `
    INSERT INTO mc_approval_events (approval_id, event_type, actor, payload)
    VALUES ('${safeId}', '${action}', ${safeActor}, ${eventPayload})
  `;

  const taskPrisma = getTaskPrisma();
  const preferred = taskPrisma ?? prisma;

  const run = async (client: typeof prisma) => {
    await client.$executeRawUnsafe(updateSql);
    await client.$executeRawUnsafe(eventSql);
  };

  try {
    await run(preferred);
  } catch (error) {
    if (!taskPrisma) throw error;
    await run(prisma);
  }
}

export async function resumeApproval(
  id: string,
  actor = "system",
  payload?: Record<string, unknown> | null,
): Promise<void> {
  const safeId = escapeLiteral(id);
  const safeActor = `'${escapeLiteral(actor)}'`;
  const payloadJson = payload ? asJsonbLiteral(payload) : "NULL";

  const updateSql = `
    UPDATE mc_approval_requests
    SET resumed_at = COALESCE(resumed_at, NOW())
    WHERE id = '${safeId}'
  `;

  const eventSql = `
    INSERT INTO mc_approval_events (approval_id, event_type, actor, payload)
    VALUES ('${safeId}', 'resume_requested', ${safeActor}, ${payloadJson})
  `;

  const taskPrisma = getTaskPrisma();
  const preferred = taskPrisma ?? prisma;

  const run = async (client: typeof prisma) => {
    await client.$executeRawUnsafe(updateSql);
    await client.$executeRawUnsafe(eventSql);
  };

  try {
    await run(preferred);
  } catch (error) {
    if (!taskPrisma) throw error;
    await run(prisma);
  }
}

export async function recordExecution(
  id: string,
  executionResult: Record<string, unknown>,
  actor = "system",
): Promise<void> {
  const safeId = escapeLiteral(id);
  const safeActor = `'${escapeLiteral(actor)}'`;
  const resultJson = asJsonbLiteral(executionResult);

  const updateSql = `
    UPDATE mc_approval_requests
    SET
      resumed_at = COALESCE(resumed_at, NOW()),
      executed_at = NOW(),
      execution_result = ${resultJson}
    WHERE id = '${safeId}'
  `;

  const eventSql = `
    INSERT INTO mc_approval_events (approval_id, event_type, actor, payload)
    VALUES ('${safeId}', 'resume_executed', ${safeActor}, ${resultJson})
  `;

  const taskPrisma = getTaskPrisma();
  const preferred = taskPrisma ?? prisma;

  const run = async (client: typeof prisma) => {
    await client.$executeRawUnsafe(updateSql);
    await client.$executeRawUnsafe(eventSql);
  };

  try {
    await run(preferred);
  } catch (error) {
    if (!taskPrisma) throw error;
    await run(prisma);
  }
}

export async function markApprovalExecuted(
  id: string,
  executionResult: Record<string, unknown>,
): Promise<void> {
  await recordExecution(id, executionResult, "system");
}
