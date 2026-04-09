"use client";

import { List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Heading } from "@/lib/markdown-utils";

type DocsTocProps = {
  headings: Heading[];
  activeHeadingId: string | null;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onHeadingClick: (id: string) => void;
};

export function DocsToc({ headings, activeHeadingId, contentRef, onHeadingClick }: DocsTocProps) {
  if (headings.length === 0) return null;

  return (
    <nav className="space-y-0.5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <List className="h-3.5 w-3.5" />
        On this page
      </p>
      {headings.map((h) => (
        <a
          key={h.id}
          href={`#${h.id}`}
          onClick={(e) => {
            e.preventDefault();
            const target = contentRef.current?.querySelector(`[id="${h.id}"]`);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
              onHeadingClick(h.id);
            }
          }}
          className={cn(
            "docs-toc-link",
            h.level >= 3 && "pl-6 text-xs",
            h.level >= 4 && "pl-9",
            activeHeadingId === h.id && "docs-toc-link-active",
          )}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}
