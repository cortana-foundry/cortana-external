export type CodexDirective = {
  name: string;
  attrs: Record<string, string>;
  raw: string;
};

export type DirectiveSegment =
  | { kind: "text"; text: string }
  | { kind: "directive"; directive: CodexDirective };

export function parseCodexDirectives(input: string): DirectiveSegment[] {
  if (!input) {
    return [];
  }

  const segments: DirectiveSegment[] = [];
  const directiveRegex = /::([a-z][a-z0-9-]*)\{([^}]*)\}/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = directiveRegex.exec(input)) !== null) {
    // Push text before this match
    if (match.index > lastIndex) {
      const textBefore = input.substring(lastIndex, match.index);
      segments.push({ kind: "text", text: textBefore });
    }

    // Parse the directive
    const name = match[1];
    const attrsBody = match[2];
    const raw = match[0];

    const attrs: Record<string, string> = {};
    const attrRegex = /(\w+)=(?:"([^"]*)"|([^\s}]+))/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(attrsBody)) !== null) {
      const key = attrMatch[1];
      const quotedValue = attrMatch[2];
      const bareValue = attrMatch[3];
      attrs[key] = quotedValue !== undefined ? quotedValue : bareValue;
    }

    segments.push({
      kind: "directive",
      directive: {
        name,
        attrs,
        raw,
      },
    });

    lastIndex = directiveRegex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < input.length) {
    segments.push({ kind: "text", text: input.substring(lastIndex) });
  }

  return segments;
}
