"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/docs/code-block";
import { cn } from "@/lib/utils";

type MessageContentProps = {
  content: string;
  className?: string;
};

function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    const children = (node.props as { children?: React.ReactNode }).children;
    return extractText(children);
  }
  return "";
}

const markdownComponents = {
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
    if (React.isValidElement(children)) {
      const childProps = children.props as { className?: string; children?: React.ReactNode };
      const className = childProps.className ?? "";
      const lang = className.replace(/^language-/, "") || null;
      const text = extractText(childProps.children).replace(/\n$/, "");
      return <CodeBlock code={text} language={lang} />;
    }
    return <pre {...props}>{children}</pre>;
  },
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

export function MessageContent({ content, className }: MessageContentProps) {
  return (
    <div
      className={cn(
        "docs-prose prose-sm max-w-none",
        "prose-p:my-2 prose-p:leading-6 prose-p:text-foreground",
        "prose-headings:mt-4 prose-headings:mb-2",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        "prose-pre:my-3",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
