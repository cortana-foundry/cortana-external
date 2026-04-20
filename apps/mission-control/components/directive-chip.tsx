"use client";

import { Badge } from "@/components/ui/badge";
import {
  FilePlus,
  GitCommit,
  Upload,
  Download,
  GitPullRequest,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CodexDirective } from "@/lib/codex-directives";

type Props = {
  directive: CodexDirective;
  className?: string;
};

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "git-stage": FilePlus,
  "git-commit": GitCommit,
  "git-push": Upload,
  "git-pull": Download,
  "git-create-pr": GitPullRequest,
};

export function DirectiveChip({ directive, className }: Props) {
  const IconComponent = iconMap[directive.name] || Sparkles;
  const title = Object.entries(directive.attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");

  const badgeContent = (
    <Badge
      variant="outline"
      className={cn("inline-flex items-center gap-1 font-mono text-xs", className)}
      title={title}
      data-directive-icon={
        iconMap[directive.name] ? directive.name : "sparkles"
      }
    >
      <IconComponent className="h-3 w-3" />
      {directive.name}
    </Badge>
  );

  if (directive.attrs.url) {
    return (
      <a
        href={directive.attrs.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline"
      >
        {badgeContent}
      </a>
    );
  }

  return badgeContent;
}
