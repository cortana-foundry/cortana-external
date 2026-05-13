import { Badge } from "@/components/ui/badge";
import { formatOperatorTimestamp } from "@/lib/format-utils";
import type {
  ArtifactState,
  TradingOpsLiveData,
  TradingOpsPolymarketData,
  TradingOpsPolymarketLiveData,
} from "@/lib/trading-ops-contract";
import { badgeVariantForStreamer } from "@/lib/trading-ops/badge-variants";
import { formatLabel } from "@/lib/trading-ops/format";
import { CompactTapeStrip } from "../animated-quote";
import { Metric, ArtifactPanel } from "../shared";

const COMPACT_TAPE_ORDER = ["SPY", "QQQ", "IWM", "DOW", "NASDAQ"];

export function OverviewTab({
  liveData,
  liveArtifact,
  lastSuccessfulAt,
  displayPolymarketData,
  displayPolymarketLiveData,
  polymarketStatusArtifact,
  polymarketPinnedCount,
}: {
  liveData: TradingOpsLiveData | null;
  liveArtifact: ArtifactState<TradingOpsLiveData>;
  lastSuccessfulAt: string | null;
  displayPolymarketData: TradingOpsPolymarketData | null;
  displayPolymarketLiveData: TradingOpsPolymarketLiveData | null;
  polymarketStatusArtifact: ArtifactState<TradingOpsPolymarketData>;
  polymarketPinnedCount: number;
}) {
  return (
    <>
      <ArtifactPanel title="Schwab live now" artifact={liveArtifact}>
        {liveData ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={badgeVariantForStreamer(liveData.streamer)} className="text-[10px]">
                {liveData.streamer.connected ? "Streamer connected" : "Streamer disconnected"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {liveData.tape.freshnessMessage}
              </span>
            </div>
            <CompactTapeStrip rows={liveData.tape.rows.filter((row) => COMPACT_TAPE_ORDER.includes(row.symbol))} />
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Decision" value={liveData.meta.decision ?? "No decision yet"} />
              <Metric label="Focus" value={liveData.meta.focusTicker ?? "No focus ticker"} />
              <Metric label="Mode" value={liveData.meta.isAfterHours ? "After hours" : "Market hours"} />
              <Metric label="Last refresh" value={lastSuccessfulAt ? formatOperatorTimestamp(lastSuccessfulAt) : "Waiting for first poll"} />
            </dl>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Waiting for the first Schwab live quote poll.
          </p>
        )}
      </ArtifactPanel>

      <ArtifactPanel title="Polymarket status" artifact={polymarketStatusArtifact}>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Account"
              value={
                displayPolymarketData?.account.data
                  ? `${displayPolymarketData.account.data.positionCount} positions · ${displayPolymarketData.account.data.openOrdersCount} orders`
                  : "Waiting for account read"
              }
            />
            <Metric
              label="Overlay"
              value={displayPolymarketData?.signal.data?.overlaySummary ?? displayPolymarketData?.signal.data?.alignment ?? "Loading"}
            />
            <Metric label="Linked symbols" value={String(displayPolymarketData?.watchlist.data?.totalCount ?? 0)} />
            <Metric
              label="Pinned"
              value={displayPolymarketLiveData ? String(polymarketPinnedCount) : "Waiting"}
            />
            <Metric
              label="Stream"
              value={
                displayPolymarketLiveData
                  ? displayPolymarketLiveData.streamer.marketsConnected && displayPolymarketLiveData.streamer.privateConnected
                    ? `${displayPolymarketLiveData.markets.length} live markets`
                    : formatLabel(displayPolymarketLiveData.streamer.operatorState)
                  : "Waiting for stream"
              }
            />
          </div>
          {displayPolymarketData?.signal.data?.compactLines[0] ? (
            <p className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-xs">
              {displayPolymarketData.signal.data.compactLines[0]}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Waiting for the Polymarket overlay snapshot.
            </p>
          )}
        </div>
      </ArtifactPanel>
    </>
  );
}
