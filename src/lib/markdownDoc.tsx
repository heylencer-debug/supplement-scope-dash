/**
 * MarkdownDoc — THE shared markdown renderer for long-form AI documents
 * (formula briefs, QA reports, benchmarking, FDA compliance, market
 * reports, off-Amazon research findings, etc).
 *
 * Unifies the several hand-rolled `renderMarkdown`/`renderInlineBold`
 * parsers that used to be scattered across FormulaValidationTab,
 * FormulaQATab, FormulaBriefTab, MarketIntelligenceReport, and
 * ManufacturerFeedback — all of which only handled `**bold**` (some
 * missed `*italic*`, GFM tables, or leaked literal `#`/`*` on edge
 * cases). This wraps `react-markdown` + `remark-gfm` (already
 * dependencies) instead of re-implementing a markdown parser, and relies
 * on the `.document-prose` CSS class (src/index.css) for typography —
 * headings, lists, tables, blockquote, hr, strong/em all styled there.
 *
 * Usage:
 *   <MarkdownDoc content={qa.qa_report} />                 // full document
 *   <MarkdownDoc content={line} inline />                  // single inline run, no block spacing
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export interface MarkdownDocProps {
  content: string | null | undefined;
  className?: string;
  /** Render without the `.document-prose` block wrapper — for a single
   * inline run of text (e.g. inside a table cell or a badge) that only
   * needs bold/italic/code handling, not heading/list/table typography. */
  inline?: boolean;
}

export function MarkdownDoc({ content, className, inline }: MarkdownDocProps) {
  if (!content || !content.trim()) return null;

  if (inline) {
    return (
      <span className={className}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <>{children}</>,
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            code: ({ children }) => <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded text-primary">{children}</code>,
            a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>,
          }}
        >
          {content}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div className={cn("document-prose", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="document-table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownDoc;
