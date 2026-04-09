import * as React from "react";

/* ── types ── */

export type SerializedAgent = {
  id: string;
  name: string;
  role: string;
  status: string;
  model: string | null;
  modelDisplay: string | null;
  capabilities: string;
  healthScore: number | null;
  lastSeen: string | null;
};

export type CouncilSessionSummary = {
  id: string;
  topic: string;
  status: string;
  mode: string;
  confidence: number | null;
  createdAt: string;
  decidedAt: string | null;
};

export type UsageData = {
  windowMinutes: number;
  totals: { sessions: number; totalTokens: number; inputTokens: number; outputTokens: number; estimatedCost: number };
  byModel: Array<{ model: string; sessions: number; totalTokens: number; estimatedCost: number }>;
  byAgent: Array<{ agentId: string; model: string; sessions: number; totalTokens: number; estimatedCost: number }>;
};

export type SessionData = {
  key: string | null;
  sessionId: string | null;
  updatedAt: number | null;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  agentId: string | null;
  estimatedCost: number;
};

export type LogEntry = {
  id: number;
  timestamp: string;
  severity: string;
  source: string;
  eventType: string;
  message: string;
};

export type Tab = "overview" | "config" | "agents" | "cron" | "sessions" | "logs";

/* ── helpers ── */

export { formatInt, formatCost as formatMoney } from "@/lib/format-utils";

/* ── shared components ── */

export function TabLoading({ cards = 4, rows = 3 }: { cards?: number; rows?: number } = {}) {
  return (
    <div className="space-y-3 py-4 animate-pulse">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-card/40 p-3">
            <div className="h-3 w-24 rounded bg-muted/60" />
            <div className="mt-2 h-4 w-32 rounded bg-muted/60" />
            <div className="mt-1 h-3 w-40 rounded bg-muted/60" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border/50 bg-card/30 p-4">
          <div className="h-4 w-36 rounded bg-muted/60" />
          <div className="mt-2 h-3 w-full max-w-md rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

export function TabError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
      <p className="text-sm font-medium text-destructive">Something went wrong</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function TabShell({ loading, error, onRetry, children }: {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (error) return <TabError message={error} onRetry={onRetry} />;
  if (loading) return <TabLoading />;
  return <>{children}</>;
}

export function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-1 font-mono text-lg font-semibold leading-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
