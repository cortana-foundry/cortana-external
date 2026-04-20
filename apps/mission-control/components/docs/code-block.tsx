"use client";

import { useEffect, useState } from "react";
import { type Highlighter, createHighlighter } from "shiki";
import { CopyButton } from "./copy-button";
import { MermaidDiagram } from "./mermaid-diagram";

/* ── shiki singleton ── */

const THEMES = ["catppuccin-latte", "catppuccin-mocha"] as const;
const LANGS = [
  "typescript", "javascript", "tsx", "jsx",
  "python", "bash", "shell",
  "json", "yaml", "toml",
  "markdown", "sql", "go", "rust",
  "css", "html", "diff",
] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [...THEMES], langs: [...LANGS] });
  }
  return highlighterPromise;
}

/* ── component ── */

type CodeBlockProps = {
  code: string;
  language: string | null;
};

export function CodeBlock({ code, language }: CodeBlockProps) {
  if (language === "mermaid") {
    return <MermaidDiagram code={code} />;
  }

  return <HighlightedBlock code={code} language={language} />;
}

function HighlightedBlock({ code, language }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const highlighter = await getHighlighter();
        const loadedLangs = highlighter.getLoadedLanguages();
        const lang = language && loadedLangs.includes(language) ? language : "text";

        const rendered = highlighter.codeToHtml(code, {
          lang,
          themes: { light: "catppuccin-latte", dark: "catppuccin-mocha" },
        });

        if (!cancelled) setHtml(rendered);
      } catch {
        // Shiki failed — leave unhighlighted
      }
    })();

    return () => { cancelled = true; };
  }, [code, language]);

  const displayLang = language ? language.toLowerCase() : "text";

  return (
    <div className="not-prose docs-code-block">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {displayLang}
        </span>
        <CopyButton text={code} />
      </div>
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="p-4 overflow-x-auto text-sm"><code>{code}</code></pre>
      )}
    </div>
  );
}
