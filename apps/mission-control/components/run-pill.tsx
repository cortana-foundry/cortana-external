export type RunPillTone = "emerald" | "amber" | "red";

export function RunPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: RunPillTone;
}) {
  const cls: Record<RunPillTone, string> = {
    emerald:
      "border-emerald-200/70 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200",
    amber:
      "border-amber-200/70 bg-amber-50/60 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200",
    red: "border-red-200/70 bg-red-50/60 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cls[tone]}`}>
      <span>{label}</span>
      <span className="font-mono font-bold">{count}</span>
    </div>
  );
}
