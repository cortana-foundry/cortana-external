"use client";

import * as React from "react";
import {
  Activity,
  Database,
  ExternalLink,
  KeyRound,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  WorkspaceData,
  WorkspaceEnvFile,
  WorkspaceField,
  WorkspaceHealthItem,
  WorkspaceHealthTone,
  WorkspaceSection,
} from "@/lib/service-workspace";

type WorkspaceRouteResponse =
  | { status: "ok"; data: WorkspaceData }
  | { status: "error"; message: string };

const POLL_MS = 45_000;

const toneClasses: Record<
  WorkspaceHealthTone,
  {
    badge: React.ComponentProps<typeof Badge>["variant"];
    panel: string;
    dot: string;
    accent: string;
  }
> = {
  healthy: {
    badge: "success",
    panel: "border-emerald-300/70 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20",
    dot: "bg-emerald-500",
    accent: "text-emerald-800 dark:text-emerald-200",
  },
  degraded: {
    badge: "warning",
    panel: "border-amber-300/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20",
    dot: "bg-amber-500",
    accent: "text-amber-800 dark:text-amber-200",
  },
  unhealthy: {
    badge: "destructive",
    panel: "border-red-300/70 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20",
    dot: "bg-red-500",
    accent: "text-red-800 dark:text-red-200",
  },
  unknown: {
    badge: "outline",
    panel: "border-border/70 bg-background/70",
    dot: "bg-slate-400",
    accent: "text-foreground",
  },
};

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
};

const makeFieldId = (field: Pick<WorkspaceField, "fileId" | "key">) => `${field.fileId}:${field.key}`;

async function requestWorkspace(
  init?: RequestInit,
): Promise<WorkspaceData> {
  const response = await fetch("/api/services/workspace", {
    cache: "no-store",
    ...init,
  });
  const payload = (await response.json()) as WorkspaceRouteResponse;
  if (!response.ok || payload.status !== "ok") {
    throw new Error(payload.status === "error" ? payload.message : "Request failed");
  }
  return payload.data;
}

async function requestActionUrl(action: "whoop-auth-url" | "schwab-auth-url") {
  const response = await fetch(`/api/services/actions/${action}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as { status: "ok"; url: string } | { status: "error"; message: string };

  if (!response.ok || payload.status !== "ok") {
    throw new Error(payload.status === "error" ? payload.message : "Action failed");
  }

  return payload.url;
}

function hydrateDrafts(data: WorkspaceData) {
  const drafts: Record<string, string> = {};

  for (const field of data.sections.flatMap((section) => section.fields)) {
    drafts[makeFieldId(field)] = field.input === "secret" ? "" : field.currentValue;
  }

  return drafts;
}

function toneLabel(tone: WorkspaceHealthTone) {
  if (tone === "healthy") return "Healthy";
  if (tone === "degraded") return "Degraded";
  if (tone === "unhealthy") return "Unhealthy";
  return "Unknown";
}

function sectionDirtyCount(
  section: WorkspaceSection,
  drafts: Record<string, string>,
  clearRequested: Record<string, boolean>,
) {
  return section.fields.filter((field) => isFieldDirty(field, drafts, clearRequested)).length;
}

function isFieldDirty(
  field: WorkspaceField,
  drafts: Record<string, string>,
  clearRequested: Record<string, boolean>,
) {
  const fieldId = makeFieldId(field);
  if (field.input === "secret") {
    return Boolean(clearRequested[fieldId]) || (drafts[fieldId]?.trim().length ?? 0) > 0;
  }
  return (drafts[fieldId] ?? "") !== field.currentValue;
}

function buildUpdates(
  data: WorkspaceData,
  drafts: Record<string, string>,
  clearRequested: Record<string, boolean>,
) {
  return data.sections.flatMap((section) =>
    section.fields.flatMap((field) => {
      const fieldId = makeFieldId(field);
      const nextValue = drafts[fieldId] ?? "";

      if (field.input === "secret") {
        if (clearRequested[fieldId]) {
          return [{ fileId: field.fileId, key: field.key, value: null }];
        }

        if (nextValue.trim().length > 0) {
          return [{ fileId: field.fileId, key: field.key, value: nextValue }];
        }

        return [];
      }

      if (nextValue === field.currentValue) {
        return [];
      }

      return [{ fileId: field.fileId, key: field.key, value: nextValue.trim().length > 0 ? nextValue : null }];
    }),
  );
}

export default function ServicesClient() {
  const [data, setData] = React.useState<WorkspaceData | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [clearRequested, setClearRequested] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isSaving, startSaving] = React.useTransition();
  const [isRefreshing, startRefreshing] = React.useTransition();
  const [authAction, setAuthAction] = React.useState<"whoop-auth-url" | "schwab-auth-url" | null>(null);

  const loadWorkspace = React.useCallback(
    async (options?: { preserveDrafts?: boolean }) => {
      const nextData = await requestWorkspace();
      setData(nextData);

      if (!options?.preserveDrafts) {
        setDrafts(hydrateDrafts(nextData));
        setClearRequested({});
      }
    },
    [],
  );

  React.useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const nextData = await requestWorkspace();
        if (!active) return;
        setData(nextData);
        setDrafts(hydrateDrafts(nextData));
        setClearRequested({});
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load services workspace.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  const dirtyCount = React.useMemo(() => {
    if (!data) return 0;
    return data.sections.reduce(
      (total, section) => total + sectionDirtyCount(section, drafts, clearRequested),
      0,
    );
  }, [clearRequested, data, drafts]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (dirtyCount > 0) return;
      startRefreshing(() => {
        void loadWorkspace({ preserveDrafts: false }).catch((refreshError) => {
          setError(refreshError instanceof Error ? refreshError.message : "Refresh failed.");
        });
      });
    }, POLL_MS);

    return () => window.clearInterval(interval);
  }, [dirtyCount, loadWorkspace]);

  const handleSave = () => {
    if (!data) return;
    setNotice(null);
    setError(null);

    const updates = buildUpdates(data, drafts, clearRequested);
    if (updates.length === 0) {
      setNotice("No changes to save.");
      return;
    }

    startSaving(() => {
      void (async () => {
        try {
          const nextData = await requestWorkspace({
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ updates }),
          });
          setData(nextData);
          setDrafts(hydrateDrafts(nextData));
          setClearRequested({});
          setNotice("Configuration saved. Restart the affected service to apply env changes.");
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : "Save failed.");
        }
      })();
    });
  };

  const handleRefresh = () => {
    setNotice(null);
    setError(null);
    startRefreshing(() => {
      void loadWorkspace({ preserveDrafts: dirtyCount > 0 }).catch((refreshError) => {
        setError(refreshError instanceof Error ? refreshError.message : "Refresh failed.");
      });
    });
  };

  const handleAuth = (action: "whoop-auth-url" | "schwab-auth-url") => {
    setAuthAction(action);
    setError(null);
    setNotice(null);

    void (async () => {
      try {
        const url = await requestActionUrl(action);
        window.open(url, "_blank", "noopener,noreferrer");
        setNotice(
          action === "whoop-auth-url"
            ? "Opened the Whoop OAuth flow in a new tab."
            : "Opened the Schwab OAuth flow in a new tab.",
        );
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : "Failed to launch auth flow.");
      } finally {
        setAuthAction(null);
      }
    })();
  };

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Service Workspace
        </p>
        <div className="rounded-3xl border border-border/70 bg-background/80 p-8 text-sm text-muted-foreground">
          Loading service health and configuration...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Service Workspace
        </p>
        <div className="rounded-3xl border border-red-300/70 bg-red-50/70 p-6 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/20 dark:text-red-100">
          {error ?? "Services workspace unavailable."}
        </div>
      </div>
    );
  }

  const primaryHealth = data.health.slice(0, 4);
  const inspectorHealth = data.health.slice(4);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-[linear-gradient(135deg,rgba(13,18,28,0.98),rgba(40,49,66,0.94))] px-6 py-6 text-white shadow-[0_24px_80px_rgba(11,16,24,0.18)] sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217,182,120,0.22),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(90,157,255,0.18),transparent_28%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white/70">
              <span>Mission Control</span>
              <span className="text-white/35">/</span>
              <span>Service Workspace</span>
            </div>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                OpenClaw and external-service configuration now live in one surface.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
                Health stays visible while you edit the actual env-backed controls for Mission Control, market-data, and recovery providers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-white/75">
              <Badge variant="outline" className="border-white/20 bg-white/8 text-white">
                {data.sections.length} config groups
              </Badge>
              <Badge variant="outline" className="border-white/20 bg-white/8 text-white">
                {data.files.length} env files
              </Badge>
              <Badge variant="outline" className="border-white/20 bg-white/8 text-white">
                Updated {formatUpdatedAt(data.generatedAt)}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              className="border-white/15 bg-white/6 text-white hover:bg-white/10"
              onClick={handleRefresh}
              disabled={isRefreshing || isSaving}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button
              className="bg-[#d9b678] text-slate-950 hover:bg-[#e1bf86]"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "Save changes"}
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-300/70 bg-red-50/70 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/20 dark:text-red-100">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-300/70 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <aside className="hidden xl:block">
          <div className="sticky top-8 space-y-4">
            <div className="rounded-3xl border border-border/70 bg-background/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Index
              </p>
              <div className="mt-4 space-y-1">
                <a href="#services-overview" className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/60">
                  <span>Overview</span>
                  <Badge variant="outline">{primaryHealth.length}</Badge>
                </a>
                {data.sections.map((section) => {
                  const count = sectionDirtyCount(section, drafts, clearRequested);
                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      <span>{section.label}</span>
                      {count > 0 ? <Badge variant="warning">{count}</Badge> : <span className="text-xs">•</span>}
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                OAuth
              </p>
              <div className="mt-4 grid gap-2">
                <Button
                  variant="outline"
                  className="justify-between"
                  onClick={() => handleAuth("schwab-auth-url")}
                  disabled={authAction != null}
                >
                  Schwab connect
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="justify-between"
                  onClick={() => handleAuth("whoop-auth-url")}
                  disabled={authAction != null}
                >
                  Whoop connect
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-8">
          <section
            id="services-overview"
            className="rounded-[2rem] border border-border/70 bg-background/90 p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Overview
                </p>
                <h2 className="text-2xl font-semibold tracking-tight">Live control plane snapshot</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Health stays pinned here so config edits never lose operational context.
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Auto-refresh every {Math.round(POLL_MS / 1000)}s when the form is clean
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {primaryHealth.map((item) => (
                <HealthSummaryCard key={item.id} item={item} />
              ))}
            </div>
          </section>

          {data.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="rounded-[2rem] border border-border/70 bg-background/90 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {section.fileId === "missionControl" ? "Mission Control" : "External Service"}
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight">{section.label}</h2>
                  <p className="max-w-2xl text-sm text-muted-foreground">{section.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{section.fields.length} fields</Badge>
                  {sectionDirtyCount(section, drafts, clearRequested) > 0 ? (
                    <Badge variant="warning">
                      {sectionDirtyCount(section, drafts, clearRequested)} pending
                    </Badge>
                  ) : (
                    <Badge variant="success">Synced</Badge>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {section.fields.map((field) => {
                  const fieldId = makeFieldId(field);
                  return (
                    <FieldEditor
                      key={fieldId}
                      field={field}
                      value={drafts[fieldId] ?? ""}
                      clearRequested={Boolean(clearRequested[fieldId])}
                      onChange={(nextValue) =>
                        setDrafts((current) => ({ ...current, [fieldId]: nextValue }))
                      }
                      onToggleClear={() =>
                        setClearRequested((current) => ({
                          ...current,
                          [fieldId]: !current[fieldId],
                        }))
                      }
                    />
                  );
                })}
              </div>
            </section>
          ))}

          <section className="rounded-[2rem] border border-border/70 bg-background/90 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  File Inventory
                </p>
                <h2 className="text-2xl font-semibold tracking-tight">Modeled env files</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Curated controls cover the primary service settings. Any extra keys already in these files remain intact and are listed below.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {data.files.map((file) => (
                <EnvFileCard key={file.id} file={file} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
          <div className="rounded-[2rem] border border-border/70 bg-background/90 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Inspector
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Health detail</h2>
              </div>
              <Badge variant="outline">{data.health.length}</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {[...primaryHealth, ...inspectorHealth].map((item) => (
                <HealthInspectorCard key={item.id} item={item} />
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-border/70 bg-background/90 p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Apply
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">After you save</h2>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <ActionRow icon={Database} title="Mission Control env" body="Restart `apps/mission-control` after `.env.local` changes." />
              <ActionRow icon={PlugZap} title="External service env" body="Restart the external-service process after root `.env` changes." />
              <ActionRow icon={ShieldCheck} title="OAuth callbacks" body="Keep TLS cert/key paths aligned with the callback URLs shown in provider auth status." />
              <ActionRow icon={Sparkles} title="Docs" body={`Reference architecture: ${data.openclawDocsPath}`} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function HealthSummaryCard({ item }: { item: WorkspaceHealthItem }) {
  const tone = toneClasses[item.tone];
  const Icon =
    item.id === "openclaw-gateway"
      ? ShieldCheck
      : item.id === "external-service"
        ? Activity
        : item.id === "market-data"
          ? Database
          : KeyRound;

  return (
    <div className={cn("rounded-[1.5rem] border p-4", tone.panel)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", tone.dot)} />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </p>
          </div>
          <p className={cn("text-lg font-semibold tracking-tight", tone.accent)}>{item.summary}</p>
        </div>
        <div className="rounded-full border border-border/60 bg-background/70 p-2">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{item.detail}</p>
    </div>
  );
}

function FieldEditor({
  field,
  value,
  clearRequested,
  onChange,
  onToggleClear,
}: {
  field: WorkspaceField;
  value: string;
  clearRequested: boolean;
  onChange: (value: string) => void;
  onToggleClear: () => void;
}) {
  const fieldId = makeFieldId(field);
  const dirty = field.input === "secret" ? clearRequested || value.trim().length > 0 : value !== field.currentValue;

  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor={fieldId} className="text-sm font-medium text-foreground">
            {field.label}
          </Label>
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">{field.help}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <Badge variant="warning">Dirty</Badge> : null}
          {field.input === "secret" ? (
            field.hasValue ? <Badge variant="outline">{field.secretPreview}</Badge> : <Badge variant="outline">Empty</Badge>
          ) : field.hasValue ? (
            <Badge variant="success">Configured</Badge>
          ) : field.usesDefault ? (
            <Badge variant="secondary">Default</Badge>
          ) : (
            <Badge variant="outline">Unset</Badge>
          )}
          {clearRequested ? <Badge variant="destructive">Clear on save</Badge> : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {field.input === "textarea" ? (
          <Textarea
            id={fieldId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
            className="min-h-[108px] bg-background/80"
          />
        ) : field.input === "select" ? (
          <Select value={value || field.defaultValue || ""} onValueChange={onChange}>
            <SelectTrigger id={fieldId} className="bg-background/80">
              <SelectValue placeholder={field.placeholder ?? "Select value"} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={fieldId}
            type={field.input === "secret" ? "password" : "text"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={
              field.input === "secret" && field.hasValue
                ? "Paste a new value to replace the stored secret"
                : field.placeholder
            }
            className="bg-background/80"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="space-y-1">
            <p>
              Source: {field.hasValue ? "Env file" : field.usesDefault ? `Default (${field.defaultValue})` : "Not set"}
            </p>
            {field.input !== "secret" && field.currentValue && !field.hasValue ? (
              <p>Resolved value preview: {field.currentValue}</p>
            ) : null}
          </div>
          {field.input === "secret" && field.hasValue ? (
            <Button type="button" variant="ghost" size="sm" onClick={onToggleClear}>
              {clearRequested ? "Keep stored value" : "Clear stored value"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EnvFileCard({ file }: { file: WorkspaceEnvFile }) {
  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold">{file.label}</p>
            <Badge variant={file.exists ? "success" : "warning"}>
              {file.exists ? "Present" : "Will be created"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{file.path}</p>
        </div>
        <Badge variant="outline">{file.modeledKeys} modeled</Badge>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Additional keys
        </p>
        {file.extraKeys.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {file.extraKeys.map((key) => (
              <Badge key={key} variant="ghost" className="rounded-md border border-border/60 px-2 py-1 text-[11px]">
                {key}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No extra keys outside the curated service workspace.</p>
        )}
      </div>
    </div>
  );
}

function HealthInspectorCard({ item }: { item: WorkspaceHealthItem }) {
  const tone = toneClasses[item.tone];

  return (
    <div className={cn("rounded-[1.5rem] border p-4", tone.panel)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{item.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
        </div>
        <Badge variant={tone.badge}>{toneLabel(item.tone)}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{item.detail}</p>
      <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Checked {formatUpdatedAt(item.checkedAt)}
      </p>
      <details className="mt-3 rounded-2xl border border-border/60 bg-background/70 p-3">
        <summary className="cursor-pointer text-sm font-medium">Raw payload</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {JSON.stringify(item.raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-background p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}
