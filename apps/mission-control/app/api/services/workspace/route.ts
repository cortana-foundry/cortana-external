import { ApiError, apiJson, jsonBodyRoute, jsonRoute } from "@/lib/api-route";
import {
  ServicesWorkspaceValidationError,
  getServicesWorkspaceData,
  updateServicesWorkspaceData,
} from "@/lib/service-workspace";

type PatchPayload = {
  updates?: Array<{
    fileId: "external" | "missionControl";
    key: string;
    value: string | null;
  }>;
};

export const dynamic = "force-dynamic";

const workspaceErrorResponse = (fallback: string) => (error: unknown) => {
  const status =
    error instanceof ServicesWorkspaceValidationError || error instanceof ApiError ? 400 : 500;
  return apiJson(
    {
      status: "error",
      message: error instanceof Error ? error.message : fallback,
    },
    { status },
  );
};

export const GET = jsonRoute({
  handler: async () => ({ status: "ok", data: await getServicesWorkspaceData() }),
  errorMessage: "Failed to load services workspace",
  errorResponse: workspaceErrorResponse("Failed to load services workspace"),
});

type PatchResponse = {
  status: "ok";
  data: Awaited<ReturnType<typeof updateServicesWorkspaceData>>;
};

export const PATCH = jsonBodyRoute<unknown, PatchPayload, PatchResponse>({
  errorMessage: "Failed to update services workspace",
  errorResponse: workspaceErrorResponse("Failed to update services workspace"),
  handler: async ({ body: payload }) => {
    if (!payload || typeof payload !== "object") {
      throw new ApiError("Invalid request payload", 400);
    }

    const updates = Array.isArray(payload.updates) ? payload.updates : [];
    return { status: "ok", data: await updateServicesWorkspaceData(updates) };
  },
});
