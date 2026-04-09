"use client";

import { useEffect, useId, useState } from "react";

function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    setDark(root.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

export function MermaidDiagram({ code }: { code: string }) {
  const id = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useDarkMode();

  useEffect(() => {
    let cancelled = false;
    const renderId = `mermaid-${id.replaceAll(":", "")}`;

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          securityLevel: "loose",
          flowchart: { useMaxWidth: true },
        });
        const { svg: rendered } = await mermaid.render(renderId, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Diagram render failed");
          setSvg(null);
        }
        document.getElementById(`d${renderId}`)?.remove();
      }
    })();

    return () => { cancelled = true; };
  }, [code, dark, id]);

  if (error) {
    return (
      <div className="not-prose docs-mermaid-error">
        <p className="mb-2 text-xs font-medium text-amber-600 dark:text-amber-400">Diagram error: {error}</p>
        <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-xs"><code>{code}</code></pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="not-prose docs-mermaid">
        <p className="text-sm text-muted-foreground">Rendering diagram...</p>
      </div>
    );
  }

  return (
    <div
      className="not-prose docs-mermaid"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
