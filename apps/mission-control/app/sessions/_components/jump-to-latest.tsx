"use client";

import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type JumpToLatestProps = {
  visible: boolean;
  onClick: () => void;
  className?: string;
};

export function JumpToLatest({ visible, onClick, className }: JumpToLatestProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "pointer-events-none sticky bottom-4 z-10 flex justify-center",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-background",
        )}
      >
        <ArrowDown className="h-3.5 w-3.5" />
        Jump to latest
      </button>
    </div>
  );
}
