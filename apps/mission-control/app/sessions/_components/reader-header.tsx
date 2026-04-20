"use client";

import { ChevronDown, HelpCircle, Menu, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LiveRelativeTime } from "./live-relative-time";
import { StatusDot } from "./status-dot";
import type { StatusDotState } from "./status-dot";

type ReaderHeaderProps = {
  title: string;
  subtitle?: string | null;
  state: StatusDotState;
  savedMessageCount: number;
  updatedAt: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenInbox?: () => void;
  showInboxToggle?: boolean;
  onOpenKeyboardHelp?: () => void;
  className?: string;
};

export function ReaderHeader({
  title,
  subtitle,
  state,
  savedMessageCount,
  updatedAt,
  open,
  onOpenChange,
  onOpenInbox,
  showInboxToggle = false,
  onOpenKeyboardHelp,
  className,
}: ReaderHeaderProps) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      onOpenChange(false);
    }
  };

  return (
    <header
      onKeyDown={handleKeyDown}
      className={cn(
        "flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-2 sm:px-5",
        className,
      )}
    >
      {showInboxToggle ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenInbox}
          className="shrink-0 min-[988px]:hidden"
          aria-label="Open thread inbox"
        >
          <Menu className="h-4 w-4" />
        </Button>
      ) : null}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls="session-metadata-accordion"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/50"
      >
        <StatusDot state={state} aria-label={state} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
              {title}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <MessageSquareText className="h-3 w-3" />
              {savedMessageCount} saved
            </span>
          </span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>

        <LiveRelativeTime ts={updatedAt} className="hidden shrink-0 text-xs text-muted-foreground sm:inline" />

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {onOpenKeyboardHelp ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenKeyboardHelp}
          className="shrink-0"
          aria-label="Open keyboard shortcuts help"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      ) : null}
    </header>
  );
}
