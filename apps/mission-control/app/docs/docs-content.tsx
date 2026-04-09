"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getTextContent, slugify } from "@/lib/markdown-utils";
import type { DocFile } from "./docs-types";
import { getSectionLabel, basename } from "./docs-tree-utils";

type DocsContentProps = {
  selectedFile: DocFile | null;
  files: DocFile[];
  content: string;
  contentLoading: boolean;
  contentError: string | null;
  breadcrumbs: string[];
  contentRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: (id: string) => void;
};

export function DocsContent({
  selectedFile,
  files,
  content,
  contentLoading,
  contentError,
  breadcrumbs,
  contentRef,
  onNavigate,
}: DocsContentProps) {
  const markdownComponents = React.useMemo(() => {
    const make = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => {
      const Comp = ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
        const text = getTextContent(children);
        const id = slugify(text);
        return <Tag id={id} {...props}>{children}</Tag>;
      };
      Comp.displayName = Tag;
      return Comp;
    };

    const DocLink = ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      if (href && !href.startsWith("http") && !href.startsWith("#") && href.endsWith(".md")) {
        return (
          <a
            {...props}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              const currentDir = selectedFile ? selectedFile.name.split("/").slice(0, -1).join("/") : "";
              const parts = [...(currentDir ? currentDir.split("/") : []), ...href.split("/")];
              const resolved: string[] = [];
              for (const part of parts) {
                if (part === "..") resolved.pop();
                else if (part !== "." && part !== "") resolved.push(part);
              }
              const targetPath = resolved.join("/");
              const match = files.find((f) =>
                f.name === targetPath || f.name.endsWith("/" + targetPath) || f.name.endsWith(targetPath)
              );
              if (match) {
                onNavigate(match.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
          >
            {children}
          </a>
        );
      }
      return <a href={href} {...props}>{children}</a>;
    };
    DocLink.displayName = "DocLink";

    return {
      h1: make("h1"), h2: make("h2"), h3: make("h3"), h4: make("h4"), h5: make("h5"), h6: make("h6"),
      a: DocLink,
    };
  }, [selectedFile, files, onNavigate]);

  return (
    <>
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="mb-3 flex items-center gap-1 overflow-x-auto text-sm">
          {breadcrumbs.map((segment, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span
                className={cn(
                  "shrink-0",
                  i === breadcrumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {segment}
              </span>
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Document title + metadata */}
      {selectedFile && (
        <div className="mb-6 space-y-2 border-b border-border/50 pb-4">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {basename(selectedFile.name)}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{getSectionLabel(selectedFile.section)}</Badge>
            <span className="text-xs text-muted-foreground">{selectedFile.path}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div ref={contentRef}>
        {contentLoading ? (
          <p className="py-8 text-sm text-muted-foreground">Loading content...</p>
        ) : contentError ? (
          <p className="py-8 text-sm text-muted-foreground">{contentError}</p>
        ) : !content.trim() ? (
          <p className="py-8 text-sm text-muted-foreground">No content available.</p>
        ) : (
          <article className="docs-prose pb-16">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </>
  );
}
