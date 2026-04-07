import type { AppLogger } from "../lib/logger.js";

type FetchImpl = typeof fetch;

interface GovernanceReporterConfig {
  fetchImpl?: FetchImpl;
  logger: AppLogger;
}

interface MarketDataOperatorSnapshot {
  serviceOperatorState: string;
  serviceOperatorAction: string;
  streamerOperatorState: string;
  streamerOperatorAction: string;
  health: Record<string, unknown>;
}

type SignalState = {
  operatorState: string;
  operatorAction: string;
};

const TRACKED_STATES = new Set([
  "human_action_required",
  "max_connections_blocked",
  "streaming_paused",
  "subscription_budget_exceeded",
]);

const resolveMissionControlBaseUrl = () => {
  const explicit = process.env.MISSION_CONTROL_BASE_URL?.trim() || process.env.MISSION_CONTROL_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return null;
  return "http://127.0.0.1:3000";
};

const buildHeaders = () => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.MISSION_CONTROL_API_TOKEN?.trim();
  if (token) {
    headers["x-api-key"] = token;
  }
  return headers;
};

const toSeverity = (operatorState: string) => {
  if (operatorState === "human_action_required") return "critical";
  if (operatorState === "max_connections_blocked" || operatorState === "streaming_paused") return "high";
  return "medium";
};

const buildSummary = (subsystem: "service" | "streamer", operatorState: string) => {
  const label = subsystem === "service" ? "Market-data service" : "Market-data streamer";
  return `${label} requires operator attention (${operatorState}).`;
};

export class MarketDataGovernanceReporter {
  private readonly fetchImpl: FetchImpl;
  private readonly logger: AppLogger;
  private readonly lastSignals = new Map<string, SignalState>();

  constructor(config: GovernanceReporterConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.logger = config.logger;
  }

  async reconcile(snapshot: MarketDataOperatorSnapshot): Promise<void> {
    await this.reconcileSubsystem("service", {
      operatorState: snapshot.serviceOperatorState,
      operatorAction: snapshot.serviceOperatorAction,
    }, snapshot.health);
    await this.reconcileSubsystem("streamer", {
      operatorState: snapshot.streamerOperatorState,
      operatorAction: snapshot.streamerOperatorAction,
    }, snapshot.health);
  }

  private async reconcileSubsystem(
    subsystem: "service" | "streamer",
    signal: SignalState,
    health: Record<string, unknown>,
  ): Promise<void> {
    const operatorState = signal.operatorState.trim() || "healthy";
    const operatorAction = signal.operatorAction.trim() || "No operator action required.";
    const previous = this.lastSignals.get(subsystem);
    const recurrenceKey = `external-service:market-data:${subsystem}-operator`;

    if (!TRACKED_STATES.has(operatorState)) {
      if (previous && TRACKED_STATES.has(previous.operatorState)) {
        await this.postFeedbackSignal({
          source: "system",
          category: "external_service.market_data",
          severity: toSeverity(previous.operatorState),
          summary: buildSummary(subsystem, "healthy"),
          details: {
            subsystem,
            operator_state: "healthy",
            operator_action: "Recovered",
            previous_operator_state: previous.operatorState,
            previous_operator_action: previous.operatorAction,
            health,
          },
          recurrence_key: recurrenceKey,
          actor: "external-service.market-data",
          signal_state: "cleared",
        });
      }
      this.lastSignals.set(subsystem, { operatorState: "healthy", operatorAction: "No operator action required." });
      return;
    }

    if (previous && previous.operatorState === operatorState && previous.operatorAction === operatorAction) {
      return;
    }

    await this.postFeedbackSignal({
      source: "system",
      category: "external_service.market_data",
      severity: toSeverity(operatorState),
      summary: buildSummary(subsystem, operatorState),
      details: {
        subsystem,
        operator_state: operatorState,
        operator_action: operatorAction,
        health,
      },
      recurrence_key: recurrenceKey,
      actor: "external-service.market-data",
      signal_state: "active",
    });

    this.lastSignals.set(subsystem, { operatorState, operatorAction });
  }

  private async postFeedbackSignal(payload: Record<string, unknown>): Promise<void> {
    const baseUrl = resolveMissionControlBaseUrl();
    if (!baseUrl) return;

    try {
      const response = await this.fetchImpl(`${baseUrl}/api/feedback/ingest`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Mission Control feedback ingest failed (${response.status})`);
      }
    } catch (error) {
      this.logger.error("Unable to report market-data feedback signal to Mission Control", error);
    }
  }
}
