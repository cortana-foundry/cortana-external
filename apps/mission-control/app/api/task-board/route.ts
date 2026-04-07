import { NextRequest, NextResponse } from "next/server";
import { getTaskBoard } from "@/lib/data";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { taskId?: number; status?: string };
    const { taskId, status } = body;

    if (!taskId || !status) {
      return NextResponse.json({ error: "taskId and status are required" }, { status: 400 });
    }

    const validStatuses = ["backlog", "ready", "in_progress", "done"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    const updated = await prisma.cortanaTask.update({
      where: { id: taskId },
      data: {
        status,
        completedAt: status === "done" ? new Date() : null,
      },
    });

    return NextResponse.json({ ok: true, task: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error("PATCH /api/task-board error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const completedLimitRaw = request.nextUrl.searchParams.get("completedLimit");
    const completedOffsetRaw = request.nextUrl.searchParams.get("completedOffset");

    const completedLimit = completedLimitRaw ? Number.parseInt(completedLimitRaw, 10) : undefined;
    const completedOffset = completedOffsetRaw ? Number.parseInt(completedOffsetRaw, 10) : undefined;

    const data = await getTaskBoard({
      completedLimit: Number.isFinite(completedLimit) ? completedLimit : undefined,
      completedOffset: Number.isFinite(completedOffset) ? completedOffset : undefined,
    });

    return NextResponse.json(data, {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
