"use client";

import { useEffect, useRef } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ReplyComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  disabled?: boolean;
  error?: string | null;
  onKeyboardRegister?: (el: HTMLTextAreaElement | null) => void;
  className?: string;
};

export function ReplyComposer({
  value,
  onChange,
  onSubmit,
  pending,
  disabled = false,
  error,
  onKeyboardRegister,
  className,
}: ReplyComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    onKeyboardRegister?.(textareaRef.current);
    return () => onKeyboardRegister?.(null);
  }, [onKeyboardRegister]);

  const trimmed = value.trim();
  const sendDisabled = disabled || pending || trimmed.length === 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!sendDisabled) onSubmit();
    }
  };

  return (
    <div
      className={cn(
        "border-t border-border/60 bg-background/95 px-3 py-3 backdrop-blur sm:px-5",
        "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
        className,
      )}
    >
      {error ? (
        <div
          role="alert"
          className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-border/60 bg-background">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || pending}
          placeholder={disabled ? "Pick a thread from the inbox before sending a reply" : "Continue the selected Codex session"}
          className="field-sizing-content min-h-[72px] max-h-[30vh] resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-sm shadow-none focus-visible:ring-0"
          aria-label="Reply to Codex thread"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            ⌘↵ to send · / to focus
          </span>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={sendDisabled}
            className="rounded-md"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span>{pending ? "Sending…" : "Send"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
