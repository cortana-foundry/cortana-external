import { PolymarketPinsStore } from "./pins.js";
import type { PolymarketStreamRuntimeLike } from "./streamer.js";
import {
  BOARD_CANDIDATE_LIMIT,
  BOARD_DISCOVERY_TTL_MS,
  BOARD_TOP_LIMIT,
  getBoardTitleKey,
  selectBoardRows,
  toBoardMarketRow,
} from "./board.js";
import { dedupeFocusMarkets, discoverEventFocusMarkets, discoverSportsFocusMarkets } from "./focus.js";
import type {
  BoardDiscoverySnapshot,
  CachedBoardDiscovery,
  PolymarketClient,
  ServiceResult,
  SportsFocusFilters,
} from "./types.js";
import { compactStrings } from "./utils.js";

interface PolymarketBoardFacadeOptions {
  createClient: () => PolymarketClient;
  pinsStore: PolymarketPinsStore;
  streamRuntime: PolymarketStreamRuntimeLike;
}

export class PolymarketBoardFacade {
  private boardDiscoveryCache: CachedBoardDiscovery | null = null;
  private boardDiscoveryPromise: Promise<BoardDiscoverySnapshot> | null = null;

  constructor(private readonly options: PolymarketBoardFacadeOptions) {}

  async getBoardLiveResult(): Promise<ServiceResult<Record<string, unknown>>> {
    const [discovery, pinned] = await Promise.all([
      this.getBoardDiscoverySnapshot(),
      this.options.pinsStore.list(),
    ]);
    const pinnedSlugs = new Set(pinned.map((entry) => entry.marketSlug));
    const pinnedEventTitleKeys = new Set(
      pinned
        .filter((entry) => entry.bucket === "events")
        .map((entry) => getBoardTitleKey({
          bucket: "events",
          title: entry.title,
          eventTitle: entry.eventTitle,
        })),
    );
    const pinnedSportsTitleKeys = new Set(
      pinned
        .filter((entry) => entry.bucket === "sports")
        .map((entry) => getBoardTitleKey({
          bucket: "sports",
          title: entry.title,
          eventTitle: entry.eventTitle,
        })),
    );

    const candidatePool = dedupeFocusMarkets([
      ...discovery.events,
      ...discovery.sports,
    ]);
    const snapshot = await this.options.streamRuntime.getSnapshot([
      ...pinned.map((entry) => entry.marketSlug),
      ...candidatePool.map((entry) => entry.marketSlug),
    ]);
    const liveBySlug = new Map(snapshot.markets.map((entry) => [entry.marketSlug, entry]));

    const pinnedRows = pinned.map((entry) => toBoardMarketRow({
      slug: entry.marketSlug,
      title: entry.title,
      bucket: entry.bucket,
      pinned: true,
      pinnedAt: entry.pinnedAt,
      eventTitle: entry.eventTitle,
      league: entry.league,
      live: liveBySlug.get(entry.marketSlug) ?? null,
      liveStatus: snapshot.status,
    }));

    return {
      status: snapshot.status === "error" ? 503 : 200,
      body: {
        generatedAt: new Date().toISOString(),
        streamer: snapshot.streamer,
        account: snapshot.account,
        markets: [
          ...pinnedRows,
          ...selectBoardRows({
            candidates: discovery.events,
            liveBySlug,
            limit: BOARD_TOP_LIMIT,
            excludeSlugs: pinnedSlugs,
            excludeTitleKeys: pinnedEventTitleKeys,
          }),
          ...selectBoardRows({
            candidates: discovery.sports,
            liveBySlug,
            limit: BOARD_TOP_LIMIT,
            excludeSlugs: pinnedSlugs,
            excludeTitleKeys: pinnedSportsTitleKeys,
          }),
        ],
        warnings: compactStrings([...discovery.warnings, ...snapshot.warnings]),
        roster: {
          generatedAt: discovery.generatedAt,
          candidateEventsCount: discovery.events.length,
          candidateSportsCount: discovery.sports.length,
        },
      },
    };
  }

  async getBoardDiscoverySnapshot(): Promise<BoardDiscoverySnapshot> {
    const now = Date.now();
    if (this.boardDiscoveryCache && now - this.boardDiscoveryCache.fetchedAt < BOARD_DISCOVERY_TTL_MS) {
      return this.boardDiscoveryCache.snapshot;
    }
    if (this.boardDiscoveryPromise) {
      return this.boardDiscoveryPromise;
    }
    this.boardDiscoveryPromise = this.refreshBoardDiscoverySnapshot().finally(() => {
      this.boardDiscoveryPromise = null;
    });
    return this.boardDiscoveryPromise;
  }

  private async refreshBoardDiscoverySnapshot(): Promise<BoardDiscoverySnapshot> {
    const filters: SportsFocusFilters = {
      limit: BOARD_CANDIDATE_LIMIT,
      sort: "composite",
      minLiquidity: null,
      minVolume: null,
      minOpenInterest: null,
      maxStartHours: null,
    };

    try {
      const client = this.options.createClient();
      const [sports, events] = await Promise.all([
        discoverSportsFocusMarkets(client, filters),
        discoverEventFocusMarkets(client, filters),
      ]);
      const snapshot: BoardDiscoverySnapshot = {
        generatedAt: new Date().toISOString(),
        events,
        sports,
        warnings: compactStrings([
          sports.length === 0 ? "no active sports focus markets discovered" : null,
          events.length === 0 ? "no active event focus markets discovered" : null,
        ]),
      };
      this.boardDiscoveryCache = { fetchedAt: Date.now(), snapshot };
      return snapshot;
    } catch (error) {
      if (this.boardDiscoveryCache) {
        const warning = error instanceof Error ? error.message : String(error);
        return {
          ...this.boardDiscoveryCache.snapshot,
          warnings: compactStrings([
            ...this.boardDiscoveryCache.snapshot.warnings,
            `using cached board discovery: ${warning}`,
          ]),
        };
      }
      throw error;
    }
  }
}
