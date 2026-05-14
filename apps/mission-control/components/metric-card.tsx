import Link from "next/link";

export type MetricCardTone = "emerald" | "amber" | "red" | "neutral";

export function MetricCard({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  tone: MetricCardTone;
  href?: string;
}) {
  const toneMap: Record<MetricCardTone, string> = {
    emerald: "border-l-emerald-500 dark:border-l-emerald-400",
    amber: "border-l-amber-500 dark:border-l-amber-400",
    red: "border-l-red-500 dark:border-l-red-400",
    neutral: "border-l-border",
  };
  const valueTone: Record<MetricCardTone, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    neutral: "text-foreground",
  };

  const inner = (
    <div className={`rounded-lg border border-border/50 border-l-[3px] bg-card/60 p-3 transition-colors ${toneMap[tone]} ${href ? "hover:bg-muted/30" : ""}`}>
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold leading-tight ${valueTone[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
