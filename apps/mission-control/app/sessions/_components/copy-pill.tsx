"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyPillProps = {
  label: string;
  value: string | null | undefined;
  className?: string;
};

export function CopyPill({ label, value, className }: CopyPillProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(0);

  const handleCopy = useCallback(() => {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }, [value]);

  const display = value ?? "Unavailable";

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className={cn(
        "group flex min-w-0 flex-col items-start gap-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors hover:border-border disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      <span className="flex w-full items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="truncate">{label}</span>
        {value ? (
          copied ? (
            <Check className="h-3 w-3 shrink-0 text-foreground" />
          ) : (
            <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          )
        ) : null}
      </span>
      <span className="w-full truncate font-mono text-xs text-foreground">{display}</span>
    </button>
  );
}
