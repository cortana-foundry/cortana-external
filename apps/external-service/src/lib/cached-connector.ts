export function isFreshCache(updatedAtMs: number, ttlMs: number, nowMs = Date.now()): boolean {
  return nowMs - updatedAtMs <= ttlMs;
}

export function statusCodeFromError(error: unknown, fallback = 500): number {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : fallback;
}

export function jsonErrorResponse(error: unknown, fallbackStatus = 500): Response {
  return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
    status: statusCodeFromError(error, fallbackStatus),
    headers: { "content-type": "application/json" },
  });
}
