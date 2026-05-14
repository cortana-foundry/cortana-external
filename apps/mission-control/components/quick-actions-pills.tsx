"use client";

import { useState, type ComponentType } from "react";
import { Loader2, Play, RefreshCcw, Wallet, HeartPulse, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  renderActionResult,
  scheduleHeartbeatRefreshes,
  type ActionKey,
} from "@/lib/quick-action-renderers";

type ActionConfig = {
  key: ActionKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type ActionState = {
  state: "idle" | "loading" | "success" | "error";
  data?: unknown;
  message?: string;
};

const ACTIONS: ActionConfig[] = [
  { key: "chaos-test", label: "Chaos", icon: Play },
  { key: "reflection-sweep", label: "Sweep", icon: RefreshCcw },
  { key: "check-budget", label: "Budget", icon: Wallet },
  { key: "force-heartbeat", label: "Heartbeat", icon: HeartPulse },
];

export function QuickActionsPills() {
  const [statuses, setStatuses] = useState<Record<ActionKey, ActionState>>({
    "chaos-test": { state: "idle" },
    "reflection-sweep": { state: "idle" },
    "check-budget": { state: "idle" },
    "force-heartbeat": { state: "idle" },
  });
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);

  const runAction = async (action: ActionKey) => {
    setActiveAction(action);
    setStatuses((prev) => ({ ...prev, [action]: { state: "loading", message: "Running..." } }));

    try {
      const response = await fetch(`/api/actions/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      const payload = (await response.json()) as { ok?: boolean; message?: string } & Record<string, unknown>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Action failed");
      }

      setStatuses((prev) => ({
        ...prev,
        [action]: { state: "success", data: payload, message: payload.message || "Action completed" },
      }));

      if (action === "force-heartbeat") {
        const optimisticMs = Date.parse(String(payload.timestamp ?? ""));
        scheduleHeartbeatRefreshes(Number.isFinite(optimisticMs) ? optimisticMs : undefined);
      }
    } catch (error) {
      setStatuses((prev) => ({
        ...prev,
        [action]: { state: "error", message: error instanceof Error ? error.message : "Action failed" },
      }));
      if (action === "force-heartbeat") scheduleHeartbeatRefreshes();
    }
  };

  const activeStatus = activeAction ? statuses[activeAction] : null;

  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible">
        {ACTIONS.map((action) => {
          const status = statuses[action.key];
          const isLoading = status.state === "loading";
          const Icon = action.icon;
          return (
            <Button
              key={action.key}
              type="button"
              onClick={() => runAction(action.key)}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
              {action.label}
            </Button>
          );
        })}
      </div>

      {activeAction && activeStatus ? (
        <div className="rounded-md border border-border/70 bg-card/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider">
              {ACTIONS.find((item) => item.key === activeAction)?.label} result
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveAction(null)}
              aria-label="Dismiss action result"
              className="h-7 w-7 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {activeStatus.state === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Running action...
            </div>
          ) : null}

          {activeStatus.state === "error" ? (
            <p className="text-sm text-destructive">✕ {activeStatus.message}</p>
          ) : null}

          {activeStatus.state === "success" ? (
            <div className="space-y-2">{renderActionResult(activeAction, activeStatus.data)}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
