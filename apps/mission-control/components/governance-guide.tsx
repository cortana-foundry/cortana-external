import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function GovernanceGuide({
  label,
  summary,
  flow,
}: {
  label: string;
  summary: string;
  flow?: string[];
}) {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            What This Page Does
          </Badge>
          <p className="text-sm text-muted-foreground">{label} = {summary}</p>
        </div>

        {flow && flow.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Approval Flow
            </p>
            <div className="flex flex-wrap gap-2">
              {flow.map((step, index) => (
                <div
                  key={`${index}-${step}`}
                  className="rounded border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {index + 1}. {step}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
