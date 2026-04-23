import { jsonRoute } from "@/lib/api-route";
import { getUsageAnalytics } from "@/lib/usage-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const GET = jsonRoute({
  errorMessage: "Failed to fetch usage analytics",
  handler: ({ url }) => getUsageAnalytics(url.searchParams.get("minutes")),
});
