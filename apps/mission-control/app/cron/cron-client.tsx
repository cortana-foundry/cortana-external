"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, History, Pencil, Play, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type CronJob = {
  id: string;
  name: string;
  enabled: boolean;
  schedule?: { kind?: "cron" | "every" | "at"; expr?: string; everyMs?: number; at?: string };
  session?: { target?: "main" | "isolated" };
  payload?: { kind?: "agentTurn" | "systemEvent"; message?: string; model?: string; timeoutMs?: number; agentId?: string };
  delivery?: { mode?: "none" | "announce"; channel?: string; to?: string };
  state?: {
    lastRunAtMs?: number;
    nextRunAtMs?: number;
    lastStatus?: string;
    consecutiveErrors?: number;
    lastDurationMs?: number;
    lastDelivered?: boolean;
    lastDeliveryStatus?: string;
  };
};

type RunHistoryItem = {
  at?: string;
  runAt?: string;
  startedAt?: string;
  status?: string;
  durationMs?: number;
  duration?: number;
  delivered?: boolean;
  deliveryStatus?: string;
  raw?: string;
};

type FilterKey = "all" | "enabled" | "disabled" | "errors";

type FormState = {
  id?: string;
  name: string;
  scheduleKind: "cron" | "every" | "at";
  scheduleExpr: string;
  sessionTarget: "main" | "isolated";
  payloadKind: "agentTurn" | "systemEvent";
  payloadMessage: string;
  model: string;
  timeoutMs: string;
  deliveryMode: "none" | "announce";
  deliveryChannel: string;
  deliveryTo: string;
  agentId: string;
  enabled: boolean;
};

const defaultForm: FormState = {
  name: "",
  scheduleKind: "cron",
  scheduleExpr: "*/15 * * * *",
  sessionTarget: "main",
  payloadKind: "agentTurn",
  payloadMessage: "",
  model: "",
  timeoutMs: "30000",
  deliveryMode: "none",
  deliveryChannel: "last",
  deliveryTo: "",
  agentId: "",
  enabled: true,
};

const statusBadge = (value?: string, enabled?: boolean) => {
  const normalized = (value || "").toLowerCase();
  if (enabled === false) return <Badge variant="destructive">Disabled</Badge>;
  if (["ok", "success", "done", "completed"].includes(normalized)) return <Badge variant="success">{value}</Badge>;
  if (["error", "failed", "timeout"].includes(normalized)) return <Badge variant="destructive">{value}</Badge>;
  if (["running", "queued", "pending"].includes(normalized)) return <Badge variant="warning">{value}</Badge>;
  return <Badge variant="outline">{value || "—"}</Badge>;
};

const toRelative = (ms?: number) => {
  if (!ms) return "—";
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return diff >= 0 ? "in <1m" : "<1m ago";
  if (mins < 60) return diff >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return diff >= 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `in ${days}d` : `${days}d ago`;
};

const scheduleToText = (job: CronJob) => {
  const s = job.schedule;
  if (!s) return "—";
  if (s.kind === "cron") return `cron: ${s.expr || "—"}`;
  if (s.kind === "every") return `every: ${s.expr || (s.everyMs ? `${Math.round(s.everyMs / 1000)}s` : "—")}`;
  if (s.kind === "at") return `at: ${s.expr || s.at || "—"}`;
  return s.expr || "—";
};

export function CronClient() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cron", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || `Failed (${response.status})`);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cron jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const hasErrors = (job.state?.consecutiveErrors ?? 0) > 0;
      if (filter === "enabled" && !job.enabled) return false;
      if (filter === "disabled" && job.enabled) return false;
      if (filter === "errors" && !hasErrors) return false;

      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [job.name, scheduleToText(job), job.payload?.message, job.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [jobs, filter, search]);

  const openCreate = () => {
    setForm(defaultForm);
    setIsModalOpen(true);
  };

  const openEdit = (job: CronJob) => {
    setForm({
      id: job.id,
      name: job.name,
      scheduleKind: job.schedule?.kind || "cron",
      scheduleExpr: job.schedule?.expr || job.schedule?.at || (job.schedule?.everyMs ? `${job.schedule.everyMs}ms` : ""),
      sessionTarget: job.session?.target || "main",
      payloadKind: job.payload?.kind || "agentTurn",
      payloadMessage: job.payload?.message || "",
      model: job.payload?.model || "",
      timeoutMs: job.payload?.timeoutMs ? String(job.payload.timeoutMs) : "30000",
      deliveryMode: job.delivery?.mode || "none",
      deliveryChannel: job.delivery?.channel || "last",
      deliveryTo: job.delivery?.to || "",
      agentId: job.payload?.agentId || "",
      enabled: job.enabled,
    });
    setIsModalOpen(true);
  };

  const saveForm = async () => {
    if (!form.name.trim() || !form.scheduleExpr.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        enabled: form.enabled,
        schedule: { kind: form.scheduleKind, expr: form.scheduleExpr.trim() },
        session: form.sessionTarget,
        payload: {
          kind: form.payloadKind,
          message: form.payloadMessage,
          model: form.model || undefined,
          timeoutMs: form.timeoutMs ? Number(form.timeoutMs) : undefined,
          agentId: form.agentId || undefined,
        },
        delivery: {
          mode: form.deliveryMode,
          channel: form.deliveryChannel || undefined,
          to: form.deliveryTo || undefined,
        },
      };

      const isEdit = Boolean(form.id);
      const response = await fetch(isEdit ? `/api/cron/${form.id}` : "/api/cron", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || `Failed (${response.status})`);
      setIsModalOpen(false);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cron job");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (id: string) => {
    setBusyJobId(id);
    try {
      const response = await fetch(`/api/cron/${id}/run`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || `Failed (${response.status})`);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run cron job");
    } finally {
      setBusyJobId(null);
    }
  };

  const toggleJob = async (job: CronJob) => {
    setBusyJobId(job.id);
    try {
      const response = await fetch(`/api/cron/${job.id}/toggle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || `Failed (${response.status})`);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle cron job");
    } finally {
      setBusyJobId(null);
    }
  };

  const deleteJob = async (job: CronJob) => {
    if (!confirm(`Delete cron job \"${job.name}\"?`)) return;
    setBusyJobId(job.id);
    try {
      const response = await fetch(`/api/cron/${job.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || `Failed (${response.status})`);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete cron job");
    } finally {
      setBusyJobId(null);
    }
  };

  const openHistory = async (job: CronJob) => {
    setHistoryJob(job);
    setHistoryLoading(true);
    setHistory([]);
    try {
      const response = await fetch(`/api/cron/${job.id}/runs`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || `Failed (${response.status})`);
      setHistory(Array.isArray(data.runs) ? data.runs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Cron Jobs</p>
          <h1 className="text-3xl font-semibold tracking-tight">Scheduler control room</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage OpenClaw cron jobs with run control and history.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadJobs()}>
            <RefreshCcw className="size-4" /> Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New job
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Jobs</CardTitle>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterKey)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="enabled">Enabled</TabsTrigger>
                <TabsTrigger value="disabled">Disabled</TabsTrigger>
                <TabsTrigger value="errors">Errors</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs..."
              className="w-full md:max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading cron jobs...</p>
          ) : filteredJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cron jobs match this filter.</p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Enabled</TableHead>
                      <TableHead>Last run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Next run</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">⏱️ {job.name}</TableCell>
                        <TableCell>{scheduleToText(job)}</TableCell>
                        <TableCell>{job.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="destructive">Disabled</Badge>}</TableCell>
                        <TableCell>{toRelative(job.state?.lastRunAtMs)}</TableCell>
                        <TableCell>{statusBadge(job.state?.lastStatus, job.enabled)}</TableCell>
                        <TableCell>
                          {(job.state?.consecutiveErrors ?? 0) > 0 ? (
                            <Badge variant="destructive">{job.state?.consecutiveErrors}</Badge>
                          ) : (
                            <Badge variant="outline">0</Badge>
                          )}
                        </TableCell>
                        <TableCell>{toRelative(job.state?.nextRunAtMs)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon-xs" variant="outline" onClick={() => void toggleJob(job)} disabled={busyJobId === job.id} title="Toggle">
                              <Clock3 className="size-3" />
                            </Button>
                            <Button size="icon-xs" variant="outline" onClick={() => void runNow(job.id)} disabled={busyJobId === job.id} title="Run now">
                              <Play className="size-3" />
                            </Button>
                            <Button size="icon-xs" variant="outline" onClick={() => openEdit(job)} title="Edit">
                              <Pencil className="size-3" />
                            </Button>
                            <Button size="icon-xs" variant="outline" onClick={() => void openHistory(job)} title="History">
                              <History className="size-3" />
                            </Button>
                            <Button size="icon-xs" variant="destructive" onClick={() => void deleteJob(job)} disabled={busyJobId === job.id} title="Delete">
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:hidden">
                {filteredJobs.map((job) => (
                  <Card key={job.id}>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">⏱️ {job.name}</p>
                          <p className="text-xs text-muted-foreground">{scheduleToText(job)}</p>
                        </div>
                        {job.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="destructive">Disabled</Badge>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Last run</p>
                          <p>{toRelative(job.state?.lastRunAtMs)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Next run</p>
                          <p>{toRelative(job.state?.nextRunAtMs)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Status</p>
                          <div>{statusBadge(job.state?.lastStatus, job.enabled)}</div>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Errors</p>
                          <div>{(job.state?.consecutiveErrors ?? 0) > 0 ? <Badge variant="destructive">{job.state?.consecutiveErrors}</Badge> : <Badge variant="outline">0</Badge>}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button size="xs" variant="outline" onClick={() => void toggleJob(job)} disabled={busyJobId === job.id}>Toggle</Button>
                        <Button size="xs" variant="outline" onClick={() => void runNow(job.id)} disabled={busyJobId === job.id}>Run</Button>
                        <Button size="xs" variant="outline" onClick={() => openEdit(job)}>Edit</Button>
                        <Button size="xs" variant="outline" onClick={() => void openHistory(job)}>History</Button>
                        <Button size="xs" variant="destructive" onClick={() => void deleteJob(job)} disabled={busyJobId === job.id}>Delete</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{form.id ? "Edit cron job" : "Create cron job"}</CardTitle>
              <Button size="icon-xs" variant="ghost" onClick={() => setIsModalOpen(false)}>
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Session target</Label>
                  <Select value={form.sessionTarget} onValueChange={(value) => setForm((prev) => ({ ...prev, sessionTarget: value as "main" | "isolated" }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">main</SelectItem>
                      <SelectItem value="isolated">isolated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Schedule kind</Label>
                  <Select value={form.scheduleKind} onValueChange={(value) => setForm((prev) => ({ ...prev, scheduleKind: value as FormState["scheduleKind"] }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cron">cron</SelectItem>
                      <SelectItem value="every">every</SelectItem>
                      <SelectItem value="at">at</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Schedule expression</Label>
                  <Input value={form.scheduleExpr} onChange={(e) => setForm((prev) => ({ ...prev, scheduleExpr: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Payload kind</Label>
                  <Select value={form.payloadKind} onValueChange={(value) => setForm((prev) => ({ ...prev, payloadKind: value as FormState["payloadKind"] }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agentTurn">agentTurn</SelectItem>
                      <SelectItem value="systemEvent">systemEvent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Delivery mode</Label>
                  <Select value={form.deliveryMode} onValueChange={(value) => setForm((prev) => ({ ...prev, deliveryMode: value as FormState["deliveryMode"] }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">none</SelectItem>
                      <SelectItem value="announce">announce</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model (optional)</Label>
                  <Input value={form.model} onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Timeout ms (optional)</Label>
                  <Input value={form.timeoutMs} onChange={(e) => setForm((prev) => ({ ...prev, timeoutMs: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Agent ID (optional)</Label>
                  <Input value={form.agentId} onChange={(e) => setForm((prev) => ({ ...prev, agentId: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Delivery channel (optional)</Label>
                  <Input value={form.deliveryChannel} onChange={(e) => setForm((prev) => ({ ...prev, deliveryChannel: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Delivery target (optional)</Label>
                  <Input value={form.deliveryTo} onChange={(e) => setForm((prev) => ({ ...prev, deliveryTo: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Payload message</Label>
                  <Textarea value={form.payloadMessage} onChange={(e) => setForm((prev) => ({ ...prev, payloadMessage: e.target.value }))} rows={4} />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                    Enabled
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={() => void saveForm()} disabled={saving || !form.name.trim() || !form.scheduleExpr.trim()}>
                  {saving ? "Saving..." : form.id ? "Save changes" : "Create job"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {historyJob && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl border-l border-border bg-background p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Run history</p>
              <h2 className="text-lg font-semibold">{historyJob.name}</h2>
            </div>
            <Button size="icon-xs" variant="ghost" onClick={() => setHistoryJob(null)}>
              <X className="size-4" />
            </Button>
          </div>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Loading run history...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent runs.</p>
          ) : (
            <div className="space-y-2 overflow-y-auto pr-1">
              {history.map((run, index) => {
                const stamp = run.at || run.runAt || run.startedAt;
                const durationMs = run.durationMs ?? run.duration;
                return (
                  <Card key={`${stamp || "run"}-${index}`}>
                    <CardContent className="space-y-2 pt-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{stamp ? new Date(stamp).toLocaleString() : "—"}</span>
                        {statusBadge(run.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <p>Duration: {typeof durationMs === "number" ? `${Math.round(durationMs)}ms` : "—"}</p>
                        <p>Delivery: {run.deliveryStatus || (typeof run.delivered === "boolean" ? String(run.delivered) : "—")}</p>
                      </div>
                      {run.raw && <p className="font-mono text-[11px] text-muted-foreground">{run.raw}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
