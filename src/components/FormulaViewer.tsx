// ─── FormulaViewer ────────────────────────────────────────────────────────────
// Renders a formula brief markdown string as formatted HTML.
// Same line-parsing logic as FormulaPDF but outputs React DOM elements.

interface ParsedLine {
  type: "h1" | "h2" | "h3" | "separator" | "table" | "bullet" | "body" | "empty";
  text: string;
  cells?: string[];
  isTableHeader?: boolean;
}

function parseLines(text: string): ParsedLine[] {
  const lines = text.split("\n");
  const result: ParsedLine[] = [];
  let prevWasTable = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      result.push({ type: "empty", text: "" });
      prevWasTable = false;
      continue;
    }
    if (/^#{3}\s/.test(line)) {
      result.push({ type: "h3", text: line.replace(/^#{3}\s*/, "") });
      prevWasTable = false;
      continue;
    }
    if (/^#{2}\s/.test(line)) {
      result.push({ type: "h2", text: line.replace(/^#{2}\s*/, "") });
      prevWasTable = false;
      continue;
    }
    if (/^#\s/.test(line)) {
      result.push({ type: "h1", text: line.replace(/^#\s*/, "") });
      prevWasTable = false;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      result.push({ type: "separator", text: "" });
      prevWasTable = false;
      continue;
    }
    if (/^\s*\|/.test(line) || /\|\s*$/.test(line)) {
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
      if (cells.every((c) => /^[-: ]+$/.test(c))) continue; // skip separator rows
      const isTableHeader = !prevWasTable;
      result.push({ type: "table", text: line, cells, isTableHeader });
      prevWasTable = true;
      continue;
    }
    if (/^[-*•]\s/.test(line.trim())) {
      result.push({ type: "bullet", text: line.trim().replace(/^[-*•]\s*/, "") });
      prevWasTable = false;
      continue;
    }
    result.push({ type: "body", text: line });
    prevWasTable = false;
  }
  return result;
}

// Render inline bold/italic markers as <strong>/<em>
function InlineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf("**");
    if (boldIdx === -1) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (boldIdx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, boldIdx)}</span>);
    }
    const closeIdx = remaining.indexOf("**", boldIdx + 2);
    if (closeIdx === -1) {
      parts.push(<span key={key++}>{remaining.slice(boldIdx)}</span>);
      break;
    }
    parts.push(<strong key={key++} className="font-semibold text-gray-900">{remaining.slice(boldIdx + 2, closeIdx)}</strong>);
    remaining = remaining.slice(closeIdx + 2);
  }
  return <>{parts}</>;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FormulaViewerProps {
  text: string;
  fallback?: string;
  className?: string;
}

export function FormulaViewer({ text, fallback = "No formula content available.", className = "" }: FormulaViewerProps) {
  if (!text?.trim()) {
    return <p className="text-sm text-gray-400 py-4">{fallback}</p>;
  }

  const lines = parseLines(text);

  return (
    <div className={`formula-viewer space-y-0.5 text-sm text-gray-700 ${className}`}>
      {lines.map((line, i) => {
        switch (line.type) {
          case "h1":
            return (
              <h2 key={i} className="text-base font-bold text-gray-900 pt-5 pb-1 first:pt-0">
                <InlineText text={line.text} />
              </h2>
            );
          case "h2":
            return (
              <h3 key={i} className="text-sm font-bold text-gray-800 pt-4 pb-0.5">
                <InlineText text={line.text} />
              </h3>
            );
          case "h3":
            return (
              <h4 key={i} className="text-xs font-bold text-gray-700 uppercase tracking-wide pt-3 pb-0.5">
                <InlineText text={line.text} />
              </h4>
            );
          case "separator":
            return <hr key={i} className="border-gray-200 my-3" />;
          case "empty":
            return <div key={i} className="h-2" />;
          case "bullet":
            return (
              <div key={i} className="flex gap-2 pl-2">
                <span className="text-gray-400 shrink-0 mt-px">•</span>
                <span className="leading-relaxed"><InlineText text={line.text} /></span>
              </div>
            );
          case "table":
            return (
              <div key={i} className={`flex gap-0 ${line.isTableHeader ? "border-b border-gray-300 font-semibold text-gray-900 bg-gray-50" : "border-b border-gray-100"}`}>
                {(line.cells ?? []).map((cell, ci) => (
                  <div key={ci} className="flex-1 px-2 py-1.5 text-xs">
                    <InlineText text={cell} />
                  </div>
                ))}
              </div>
            );
          default:
            return line.text ? (
              <p key={i} className="leading-relaxed">
                <InlineText text={line.text} />
              </p>
            ) : null;
        }
      })}
    </div>
  );
}
