export type ProjectColor = {
  hue: number;
  stripe: string;
  tint: string;
  ring: string;
};

const NEUTRAL: ProjectColor = {
  hue: 0,
  stripe: "oklch(0.72 0 0)",
  tint: "oklch(0.72 0 0 / 0.08)",
  ring: "oklch(0.72 0 0 / 0.45)",
};

/**
 * DJB2 hash of the lowercased, trimmed rootPath. Maps to a hue in [0, 330) so
 * we skip the "alarm" red band.
 */
function hashHue(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 330;
}

export function getProjectColor(rootPath: string | null | undefined): ProjectColor {
  if (!rootPath) return NEUTRAL;
  const normalized = rootPath.trim().toLowerCase();
  if (normalized.length === 0) return NEUTRAL;

  const hue = hashHue(normalized);

  return {
    hue,
    stripe: `oklch(0.62 0.18 ${hue})`,
    tint: `oklch(0.62 0.18 ${hue} / 0.10)`,
    ring: `oklch(0.62 0.18 ${hue} / 0.45)`,
  };
}
