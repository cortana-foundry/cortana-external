"use client";

import { useCallback, useRef, useState } from "react";
import { Bot, Check, Copy, User } from "lucide-react";
import { MessageContent } from "@/components/message-content";
import { cn } from "@/lib/utils";
import { getProjectColor } from "./project-color";
import { StatusDot } from "./status-dot";

type MessageBlockVariant = "default" | "streaming" | "pending";
type MessageRole = "user" | "assistant";

type MessageBlockProps = {
  role: MessageRole;
  text: string;
  timestamp: number | null;
  rootPath: string | null | undefined;
  variant?: MessageBlockVariant;
  showHeader?: boolean;
  className?: string;
};

function formatExactTimestamp(ts: number | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatFullTimestamp(ts: number | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

export function MessageBlock({
  role,
  text,
  timestamp,
  rootPath,
  variant = "default",
  showHeader = true,
  className,
}: MessageBlockProps) {
  const color = getProjectColor(rootPath ?? null);
  const isAssistant = role === "assistant";
  const isStreaming = variant === "streaming";
  const isPending = variant === "pending";

  const [copied, setCopied] = useState(false);
  const timerRef = useRef(0);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }, [text]);

  return (
    <article
      data-role={role}
      data-variant={variant}
      className={cn(
        "group project-stripe relative flex gap-3 rounded-r-lg border-l-[3px] px-3 transition-colors sm:gap-4 sm:px-5",
        showHeader ? "py-3 sm:py-4" : "py-1 sm:py-2",
        isPending && "opacity-70",
        className,
      )}
      style={
        {
          "--project-stripe": color.stripe,
          "--project-tint": color.tint,
        } as React.CSSProperties
      }
    >
      {showHeader ? (
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground sm:h-7 sm:w-7",
          )}
          aria-hidden="true"
        >
          {isAssistant ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
        </div>
      ) : (
        <div className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden="true" />
      )}

      <div className="min-w-0 flex-1 space-y-1">
        {showHeader ? (
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{isAssistant ? "Codex" : "You"}</span>

            {isStreaming ? (
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em]">
                <StatusDot state="streaming" aria-label="Streaming" />
                streaming
              </span>
            ) : null}

            {isPending ? (
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                queued
              </span>
            ) : null}

            <span
              className="ml-auto flex items-center gap-2 text-[11px] opacity-60 transition-opacity group-hover:opacity-100 hover-none:opacity-60"
              title={formatFullTimestamp(timestamp)}
            >
              <span>{formatExactTimestamp(timestamp)}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-5 w-5 items-center justify-center rounded border border-border/60 bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 hover-none:opacity-60"
                aria-label={copied ? "Copied" : "Copy message"}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </span>
          </header>
        ) : (
          <div
            className="flex items-center gap-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 hover-none:opacity-0"
            title={formatFullTimestamp(timestamp)}
          >
            <button
              type="button"
              onClick={handleCopy}
              className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded border border-border/60 bg-background text-muted-foreground transition-colors hover:text-foreground"
              aria-label={copied ? "Copied" : "Copy message"}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}

        <div
          className={cn(
            "min-w-0 text-sm leading-6 text-foreground",
            isStreaming && "streaming-caret",
          )}
        >
          <MessageContent content={text} />
        </div>
      </div>
    </article>
  );
}
