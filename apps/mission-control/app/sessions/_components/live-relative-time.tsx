"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatRelativeTimestamp } from "./stream-helpers";

type LiveRelativeTimeProps = {
  ts: number | null | undefined;
  className?: string;
  title?: string;
};

const TICK_MS = 30_000;
const TICK_THRESHOLD_MS = 48 * 60 * 60 * 1_000;

function getLabel(ts: number | null | undefined): string {
  if (!ts) return "Unknown";
  if (Math.abs(Date.now() - ts) > TICK_THRESHOLD_MS) {
    // For timestamps older than 48h, show absolute date
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  // For recent timestamps, use relative format
  return formatRelativeTimestamp(ts);
}

export function LiveRelativeTime({ ts, className, title }: LiveRelativeTimeProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!ts) return;
    if (Math.abs(Date.now() - ts) > TICK_THRESHOLD_MS) return;

    const id = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [ts]);

  const label = getLabel(ts);
  const fullTitle = title ?? (ts ? new Date(ts).toLocaleString() : undefined);

  return (
    <time
      className={cn(className)}
      dateTime={ts ? new Date(ts).toISOString() : undefined}
      title={fullTitle}
    >
      {label}
    </time>
  );
}
