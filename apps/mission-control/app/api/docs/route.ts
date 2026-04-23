import { NextResponse } from "next/server";
import {
  listAllDocs,
  readDocContent,
  type DocContentResponse,
  type DocsListResponse,
} from "@/lib/docs-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");

  if (!file) {
    try {
      const files = await listAllDocs();
      const payload: DocsListResponse = { status: "ok", files };
      return NextResponse.json(payload, {
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      });
    } catch (error) {
      const payload: DocsListResponse = {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load docs.",
      };
      return NextResponse.json(payload, { status: 500 });
    }
  }

  try {
    const payload = await readDocContent(file);
    if (payload.status === "error") {
      return NextResponse.json(payload, { status: 404 });
    }
    return NextResponse.json(payload, {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const status = code === "ENOENT" ? 404 : 500;
    const payload: DocContentResponse = {
      status: "error",
      message: code === "ENOENT" ? "File not found." : "Failed to load doc.",
    };
    return NextResponse.json(payload, { status });
  }
}
