import { NextResponse } from "next/server";
import { getServicesWorkspaceData, updateServicesWorkspaceData } from "@/lib/service-workspace";

type PatchPayload = {
  updates?: Array<{
    fileId: "external" | "missionControl";
    key: string;
    value: string | null;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getServicesWorkspaceData();
    return NextResponse.json({ status: "ok", data });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load services workspace",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as PatchPayload;
    const updates = Array.isArray(payload.updates) ? payload.updates : [];
    const data = await updateServicesWorkspaceData(updates);
    return NextResponse.json({ status: "ok", data });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to update services workspace",
      },
      { status: 500 },
    );
  }
}
