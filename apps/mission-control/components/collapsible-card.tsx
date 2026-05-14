"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared `<details>`-based card primitive for the homepage bottom row.
 * Renders a `<summary>` row (always visible) and an expandable body.
 * Uses native HTML so no state plumbing or keyboard handling is needed.
 */
export function CollapsibleCard({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      className={cn(
        "group overflow-hidden rounded-lg border border-border/60 bg-card/60 [&[open]]:bg-card/80",
        className,
      )}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-card/80 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">{summary}</div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border/40 px-3 py-2">{children}</div>
    </details>
  );
}
