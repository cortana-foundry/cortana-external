import { NextResponse } from "next/server";
import { getUsageAnalytics } from "@/lib/usage-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const usage = await getUsageAnalytics(searchParams.get("minutes"));
    return NextResponse.json(usage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch usage analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
