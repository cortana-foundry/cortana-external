"use client";

import { cn } from "@/lib/utils";
import { CopyPill } from "./copy-pill";
import { formatTimestamp } from "./stream-helpers";

type MetadataAccordionProps = {
  open: boolean;
  cwd: string | null;
  sessionId: string | null;
  transcriptPath: string | null;
  cliVersion: string | null;
  model: string | null;
  updatedAt: number | null;
  className?: string;
};

export function MetadataAccordion({
  open,
  cwd,
  sessionId,
  transcriptPath,
  cliVersion,
  model,
  updatedAt,
  className,
}: MetadataAccordionProps) {
  return (
    <div
      id="session-metadata-accordion"
      aria-hidden={!open}
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        !open && "pointer-events-none",
        className,
      )}
    >
      <div className="min-h-0">
        <div className="grid gap-2 border-b border-border/60 bg-muted/[0.16] px-3 py-3 sm:grid-cols-2 sm:px-5">
          <CopyPill label="Cwd" value={cwd} />
          <CopyPill label="Session id" value={sessionId} />
          <CopyPill label="Transcript path" value={transcriptPath} />
          <CopyPill label="CLI version" value={cliVersion} />
          <CopyPill label="Model" value={model} />
          <CopyPill label="Updated" value={updatedAt ? formatTimestamp(updatedAt) : null} />
        </div>
      </div>
    </div>
  );
}
