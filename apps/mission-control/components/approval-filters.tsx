"use client";

import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

const statuses = ["all", "pending", "approved", "approved_edited", "rejected", "expired", "cancelled"] as const;
const riskLevels = ["all", "p0", "p1", "p2", "p3"] as const;
const ranges = [
  { label: "24h", value: "24" },
  { label: "7d", value: "168" },
  { label: "30d", value: "720" },
  { label: "90d", value: "2160" },
] as const;
const humanize = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());

export function ApprovalFilters({
  params,
  selectedStatus,
  selectedRiskLevel,
  selectedRangeHours,
}: {
  params: URLSearchParams;
  selectedStatus: string;
  selectedRiskLevel: string;
  selectedRangeHours: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="space-y-3 rounded-md border bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Range</span>
        {ranges.map((range) => (
          <button key={range.value} type="button" onClick={() => setFilter("rangeHours", range.value)}>
            <Badge variant={selectedRangeHours === range.value ? "secondary" : "outline"}>{range.label}</Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
        {statuses.map((status) => (
          <button key={status} type="button" onClick={() => setFilter("status", status)}>
            <Badge variant={selectedStatus === status ? "secondary" : "outline"}>
              {status === "all" ? "All" : humanize(status)}
            </Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Risk</span>
        {riskLevels.map((riskLevel) => (
          <button key={riskLevel} type="button" onClick={() => setFilter("risk_level", riskLevel)}>
            <Badge variant={selectedRiskLevel === riskLevel ? "secondary" : "outline"}>
              {riskLevel === "all" ? "All" : riskLevel.toUpperCase()}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
