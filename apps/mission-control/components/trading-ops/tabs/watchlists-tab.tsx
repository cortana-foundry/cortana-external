import type { ArtifactState, TradingRunOverview } from "@/lib/trading-ops-contract";
import { ArtifactPanel, StrategyWatchlistSection } from "../shared";

export function WatchlistsTab({
  tradingRun,
}: {
  tradingRun: ArtifactState<TradingRunOverview>;
}) {
  return (
    <ArtifactPanel title="Latest trading run watchlists" artifact={tradingRun}>
      {tradingRun.data ? (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <StrategyWatchlistSection
              strategy="Dip Buyer"
              buy={tradingRun.data.dipBuyerBuy}
              watch={tradingRun.data.dipBuyerWatch}
              noBuy={tradingRun.data.dipBuyerNoBuy}
            />
            <StrategyWatchlistSection
              strategy="CANSLIM"
              buy={tradingRun.data.canslimBuy}
              watch={tradingRun.data.canslimWatch}
              noBuy={tradingRun.data.canslimNoBuy}
            />
          </div>
        </div>
      ) : null}
    </ArtifactPanel>
  );
}
