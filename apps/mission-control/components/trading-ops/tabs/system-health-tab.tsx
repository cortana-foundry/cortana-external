import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatOperatorTimestamp } from "@/lib/format-utils";
import type {
  AlertDeliveryOverview,
  ArtifactState,
  CanaryOverview,
  FinancialServicesHealthOverview,
  RuntimeOverview,
  ScheduleRegistryOverview,
} from "@/lib/trading-ops-contract";
import { FinancialServiceCard } from "../health/financial-service-card";
import { Metric, ArtifactPanel } from "../shared";

export function SystemHealthTab({
  financialServices,
  canary,
  runtime,
  alertDelivery,
  scheduleRegistry,
}: {
  financialServices: ArtifactState<FinancialServicesHealthOverview>;
  canary: ArtifactState<CanaryOverview>;
  runtime: ArtifactState<RuntimeOverview>;
  alertDelivery: ArtifactState<AlertDeliveryOverview>;
  scheduleRegistry: ArtifactState<ScheduleRegistryOverview>;
}) {
  return (
    <>
      <ArtifactPanel title="Financial services health" artifact={financialServices}>
        {financialServices.data ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Metric label="Healthy" value={String(financialServices.data.healthyCount)} />
              <Metric label="Degraded" value={String(financialServices.data.degradedCount)} />
              <Metric label="Needs attention" value={String(financialServices.data.errorCount)} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {financialServices.data.rows.map((row) => (
                <FinancialServiceCard key={row.label} row={row} />
              ))}
            </div>
          </div>
        ) : null}
      </ArtifactPanel>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ArtifactPanel title="Pre-open readiness check" artifact={canary}>
          {canary.data ? (
            <div className="space-y-2 text-sm">
              <dl className="grid grid-cols-2 gap-2">
                <Metric label="Ready for open" value={String(canary.data.readyForOpen ?? false)} />
                <Metric label="Warnings" value={String(canary.data.warningCount)} />
                <Metric label="Checked" value={canary.data.checkedAt ? formatOperatorTimestamp(canary.data.checkedAt) : "—"} />
                <Metric label="Freshness" value={canary.data.freshness} />
              </dl>
              <div className="space-y-1">
                {canary.data.checks.map((check) => (
                  <div key={check.name} className="flex items-center justify-between rounded-md border border-border/50 px-2 py-1.5 text-xs">
                    <span className="font-mono">{check.name}</span>
                    <Badge variant={check.result === "ok" ? "success" : "warning"} className="text-[10px]">{check.result}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </ArtifactPanel>

        <ArtifactPanel title="Runtime health" artifact={runtime}>
          {runtime.data ? (
            <div className="space-y-2 text-sm">
              <Metric label="Operator action" value={runtime.data.operatorAction} />
              <Metric label="Pre-open gate" value={runtime.data.preOpenGateStatus ?? "Not reported"} />
              {runtime.data.cooldownSummary ? (
                <Metric label="Cooldown summary" value={runtime.data.cooldownSummary} />
              ) : null}
              {runtime.data.preOpenGateFreshness ? (
                <Metric label="Readiness freshness" value={runtime.data.preOpenGateFreshness} />
              ) : null}
              {runtime.data.preOpenGateDetail ? (
                <p className="text-xs text-muted-foreground">{runtime.data.preOpenGateDetail}</p>
              ) : null}
              {runtime.data.incidents.length > 0 ? (
                <div className="space-y-1.5">
                  {runtime.data.incidents.map((incident) => (
                    <div key={`health-${incident.incidentType}-${incident.severity}`} className="terminal-alert-warning flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{incident.incidentType} · {incident.severity} — {incident.operatorAction}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No active runtime incidents.</p>
              )}
            </div>
          ) : null}
        </ArtifactPanel>

        <ArtifactPanel title="Alert delivery" artifact={alertDelivery}>
          {alertDelivery.data ? (
            <div className="space-y-2 text-sm">
              <Metric label="Sent / failed" value={`${alertDelivery.data.sentCount} / ${alertDelivery.data.failedCount}`} />
              <Metric label="Last channel" value={alertDelivery.data.lastChannel ?? "unknown"} />
              <Metric label="Last status" value={alertDelivery.data.lastStatus ?? "unknown"} />
              <Metric label="Last key" value={alertDelivery.data.lastDedupeKey ?? "unknown"} />
              {alertDelivery.data.rows.slice(0, 3).map((row) => (
                <p key={`${row.sentAt}-${row.messageHash}`} className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-xs">
                  {row.channel} · {row.status} · {row.dedupeKey}
                </p>
              ))}
            </div>
          ) : null}
        </ArtifactPanel>

        <ArtifactPanel title="Schedule registry" artifact={scheduleRegistry}>
          {scheduleRegistry.data ? (
            <div className="space-y-2 text-sm">
              <Metric label="Total" value={String(scheduleRegistry.data.scheduleCount)} />
              <Metric
                label="Launchd / artifacts"
                value={`${scheduleRegistry.data.launchdCount} / ${scheduleRegistry.data.artifactCount}`}
              />
              <Metric label="Cron registries" value={String(scheduleRegistry.data.cronRegistryCount)} />
              {scheduleRegistry.data.rows.slice(0, 4).map((row) => (
                <p key={`${row.kind}-${row.name}`} className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-xs">
                  {row.name} · {row.kind} · {row.owner}
                </p>
              ))}
            </div>
          ) : null}
        </ArtifactPanel>
      </section>
    </>
  );
}
