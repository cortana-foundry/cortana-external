"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type MessageContentProps = {
  text: string;
  variant: "assistant" | "user";
};

function extractPlainText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractPlainText).join("");
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractPlainText(element.props.children);
  }
  return "";
}

function CodeBlock({
  language,
  code,
}: {
  language: string | null;
  code: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-border/60 bg-muted/60 font-mono text-xs">
      {language ? (
        <span className="pointer-events-none absolute right-2 top-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {language}
        </span>
      ) : null}
      <pre className="m-0 overflow-x-auto bg-transparent p-3 pr-14 text-xs leading-5 text-foreground">
        <code className="font-mono">{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        title={copied ? "Copied" : "Copy code"}
        className="absolute bottom-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-md border border-border/50 bg-background/80 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 group-hover/code:opacity-100"
      >
        {copied ? (
          <Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

export function MessageContent({ text, variant }: MessageContentProps) {
  if (variant === "user") {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  return (
    <div className="prose-assistant max-w-none text-sm text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p({ children }) {
            return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
          },
          a({ children, href }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {children}
              </a>
            );
          },
          ul({ children }) {
            return <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-6">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="mt-3 mb-2 text-lg font-semibold">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mt-3 mb-2 text-base font-semibold">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="mt-2 mb-1 text-sm font-semibold">{children}</h4>;
          },
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-2 border-border/60 pl-3 text-muted-foreground">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="my-3 border-border/60" />;
          },
          pre({ children }) {
            // Intercept <pre> and render CodeBlock when wrapping a <code class="language-…">
            if (React.isValidElement(children)) {
              const child = children as React.ReactElement<{
                className?: string;
                children?: React.ReactNode;
              }>;
              const className = child.props.className ?? "";
              const match = /language-([\w-]+)/.exec(className);
              const language = match ? match[1] : null;
              const raw = extractPlainText(child.props.children).replace(/\n$/, "");
              return <CodeBlock language={language} code={raw} />;
            }
            return (
              <pre className="my-2 overflow-x-auto rounded-lg border border-border/60 bg-muted/60 p-3 font-mono text-xs">
                {children}
              </pre>
            );
          },
          code({ className, children, ...rest }) {
            // Inline code only; fenced blocks are handled by the `pre` renderer above.
            const isBlock = typeof className === "string" && /language-/.test(className);
            if (isBlock) {
              return (
                <code className={cn(className, "font-mono")} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.85em] text-foreground"
                {...rest}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
