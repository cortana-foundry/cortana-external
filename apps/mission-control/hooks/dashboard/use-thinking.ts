"use client";

import { usePolledFetch } from "./use-polled-fetch";

export type ThinkingPayload = {
  ok: boolean;
  idle: boolean;
  current: string;
  items: string[];
  updatedAt: string;
};

export function useThinking() {
  return usePolledFetch<ThinkingPayload>("/api/thinking-status", 12_000);
}
