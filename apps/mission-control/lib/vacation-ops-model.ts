export type VacationTierRollup = {
  tier: number;
  total: number;
  green: number;
  yellow: number;
  red: number;
  other: number;
};

export type VacationSystemConfig = {
  tier: number;
};

export type VacationCheckRollupInput = {
  tier: number;
  status: string;
};

export type VacationIncidentRollupInput = {
  status: string;
  humanRequired: boolean;
  resolutionReason: string | null;
};

export function buildVacationTierRollup(checks: VacationCheckRollupInput[]): VacationTierRollup[] {
  const rollup = new Map<number, VacationTierRollup>();
  for (const check of checks) {
    if (!rollup.has(check.tier)) {
      rollup.set(check.tier, { tier: check.tier, total: 0, green: 0, yellow: 0, red: 0, other: 0 });
    }
    const bucket = rollup.get(check.tier)!;
    bucket.total += 1;
    if (check.status === "green") bucket.green += 1;
    else if (check.status === "yellow" || check.status === "warn") bucket.yellow += 1;
    else if (check.status === "red" || check.status === "fail") bucket.red += 1;
    else bucket.other += 1;
  }
  return Array.from(rollup.values()).sort((left, right) => left.tier - right.tier);
}

export function countVacationSystemsByTier(systems: Record<string, VacationSystemConfig>) {
  return Object.values(systems).reduce<Record<string, number>>((acc, system) => {
    const key = `tier${system.tier}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

export function countVacationIncidents(incidents: VacationIncidentRollupInput[]) {
  const active = incidents.filter((incident) => incident.status !== "resolved");
  const resolved = incidents.filter((incident) => incident.status === "resolved");

  return {
    activeIncidents: active.length,
    humanRequiredIncidents: active.filter((incident) => incident.humanRequired).length,
    resolvedIncidents: resolved.length,
    selfHeals: resolved.filter((incident) => incident.resolutionReason === "remediated").length,
  };
}
