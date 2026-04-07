import { NextResponse } from "next/server";
import { fetchCronHealthData } from "@/lib/cron-health-data";

// Re-export types and pure functions for backward compatibility (used by tests)
export {
  type JobSchedule,
  type CronHealthStatus,
  type CronDisplayStatus,
  type CronActionRecommendation,
  type CronChannelStatus,
  parseCronIntervalMs,
  getExpectedIntervalMs,
  normalizeStatus,
  shouldForceHealthyFromNextRun,
  isCronLate,
  toDisplayStatus,
  normalizeDeliveryMode,
  isNoReplyExpected,
  deriveChannelStatus,
  deriveActionRecommendation,
  toScheduleText,
} from "@/lib/cron-health-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { source, crons } = await fetchCronHealthData();

    return NextResponse.json(
      {
        source,
        generatedAt: new Date().toISOString(),
        crons,
      },
      {
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
