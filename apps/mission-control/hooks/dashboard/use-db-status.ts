"use client";

import { usePolledFetch } from "./use-polled-fetch";

export type DbStatusPayload = { postgres: boolean; lancedb: boolean };

export function useDbStatus() {
  return usePolledFetch<DbStatusPayload>("/api/db-status", 45_000);
}
