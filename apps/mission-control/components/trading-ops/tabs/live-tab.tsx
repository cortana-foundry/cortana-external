import { Badge } from "@/components/ui/badge";
import { formatOperatorTimestamp } from "@/lib/format-utils";
import type { ArtifactState, TradingOpsLiveData } from "@/lib/trading-ops-contract";
import { badgeVariantForStreamer } from "@/lib/trading-ops/badge-variants";
import { LiveTapeGrid } from "../animated-quote";
import { Metric, ArtifactPanel } from "../shared";

export function LiveTab({
  liveData,
  liveArtifact,
  lastSuccessfulAt,
}: {
  liveData: TradingOpsLiveData | null;
  liveArtifact: ArtifactState<TradingOpsLiveData>;
  lastSuccessfulAt: string | null;
}) {
  return (
    <>
      <ArtifactPanel title="Live tape" artifact={liveArtifact}>
        {liveData ? (
          <div className="space-y-3">
            <LiveTapeGrid rows={liveData.tape.rows} />
          </div>
        ) : null}
      </ArtifactPanel>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3">
          <ArtifactPanel title="Streamer status" artifact={liveArtifact}>
            {liveData ? (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={badgeVariantForStreamer(liveData.streamer)} className="text-[10px]">
                    {liveData.streamer.connected ? "Connected" : "Disconnected"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {liveData.streamer.operatorState.replaceAll("_", " ")}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-2">
                  <Metric label="Last login" value={formatOperatorTimestamp(liveData.streamer.lastLoginAt)} />
                  <Metric label="Equity subs" value={String(liveData.streamer.activeEquitySubscriptions)} />
                  <Metric label="Acct activity" value={String(liveData.streamer.activeAcctActivitySubscriptions)} />
                  <Metric
                    label="Last refresh"
                    value={lastSuccessfulAt ? formatOperatorTimestamp(lastSuccessfulAt) : "—"}
                  />
                </dl>
                {liveData.streamer.cooldownSummary ? (
                  <p className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-xs">
                    {liveData.streamer.cooldownSummary}
                  </p>
                ) : null}
              </div>
            ) : null}
          </ArtifactPanel>
        </div>
      </section>
    </>
  );
}
