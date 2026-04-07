import { NextResponse } from "next/server";
import { fetchFitnessData } from "@/lib/mjolnir-data";
import type { FitnessResponse } from "@/lib/mjolnir-data";

export const revalidate = 300;

export async function GET() {
  try {
    const { payload, cached } = await fetchFitnessData();
    return NextResponse.json(
      { ...payload, cached },
      {
        headers: {
          "cache-control": cached
            ? "public, max-age=300, stale-while-revalidate=60"
            : "public, max-age=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load fitness data.";
    const detail = error instanceof Error ? error.stack : undefined;
    const payload: FitnessResponse = {
      status: "error",
      generatedAt: new Date().toISOString(),
      cached: false,
      error: { message, detail },
    };
    return NextResponse.json(payload, {
      headers: { "cache-control": "no-store" },
    });
  }
}
