import { cn } from "@/lib/utils";

export type StatusDotState = "idle" | "streaming" | "offline" | "error";

type StatusDotProps = {
  state: StatusDotState;
  className?: string;
  "aria-label"?: string;
};

const STATE_CLASS: Record<StatusDotState, string> = {
  idle: "thinking-dot thinking-idle",
  streaming: "thinking-dot thinking-active",
  offline: "thinking-dot bg-muted-foreground/60",
  error: "thinking-dot bg-destructive",
};

export function StatusDot({ state, className, ...rest }: StatusDotProps) {
  return (
    <span
      role="status"
      aria-label={rest["aria-label"] ?? state}
      data-state={state}
      className={cn(STATE_CLASS[state], className)}
    />
  );
}
