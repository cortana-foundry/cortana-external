"use client";

import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type NewThreadEmptyStateProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  className?: string;
};

export function NewThreadEmptyState({
  value,
  onChange,
  onSubmit,
  onCancel,
  pending,
  className,
}: NewThreadEmptyStateProps) {
  const trimmed = value.trim();
  const disabled = pending || trimmed.length === 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  return (
    <div className={cn("flex flex-1 min-h-0 items-center justify-center overflow-y-auto px-4 py-6 sm:px-6", className)}>
      <div className="w-full max-w-2xl space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-muted/60">
            <Sparkles className="h-5 w-5 text-foreground/70" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Start a new Codex thread</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Describe the task, repo, or question. Mission Control will launch a fresh session in your local Codex workspace.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background shadow-sm">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What should Codex work on?"
            rows={5}
            autoFocus
            aria-label="New Codex thread prompt"
            className="min-h-[140px] resize-none border-0 bg-transparent px-4 pt-4 text-sm shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              ⌘↵ to send
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={pending}
                aria-label="Cancel new thread"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onSubmit}
                disabled={disabled}
                className="rounded-md"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span>{pending ? "Starting…" : "Start thread"}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
