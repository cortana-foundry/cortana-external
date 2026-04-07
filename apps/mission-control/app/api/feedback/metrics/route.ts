import { NextResponse } from "next/server";
import { getFeedbackMetrics, type FeedbackFilters } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const parseNumber = (value: string | null) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters: FeedbackFilters = {
    status: (searchParams.get("status") as FeedbackFilters["status"]) ?? "all",
    remediationStatus: (searchParams.get("remediationStatus") as FeedbackFilters["remediationStatus"]) ?? "all",
    severity: (searchParams.get("severity") as FeedbackFilters["severity"]) ?? "all",
    category: searchParams.get("category") || undefined,
    source: (searchParams.get("source") as FeedbackFilters["source"]) ?? "all",
    rangeHours: parseNumber(searchParams.get("rangeHours")) ?? 24 * 90,
  };

  const metrics = await getFeedbackMetrics(filters);
  return NextResponse.json(metrics, {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
