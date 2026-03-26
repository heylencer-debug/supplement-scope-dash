/**
 * P9BenchmarkOverview — Competitor benchmark from P10 QA formula brief
 * DYNAMIC: reads from formula_briefs table (comprehensive_comparison + qa_verdict)
 * Shows DOVIVE vs top competitors, updated per category.
 */

import { Trophy, CheckCircle2, FlaskConical, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useFormulaBrief } from "@/hooks/useFormulaBrief";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface P9BenchmarkOverviewProps {
  categoryId: string;
  activeVersionContent?: string | null;
  activeVersionInfo?: {
    versionNumber: number;
    changeSummary: string | null;
    createdAt: string;
  } | null;
}

/** Parse a markdown table string into headers + rows */
function parseMarkdownTable(md: string): { headers: string[]; rows: string[][] } {
  const lines = md.trim().split("\n").filter((l) => l.trim().length > 0);
  const parse = (line: string) =>
    line.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parse(lines[0]);
  // skip separator line (index 1)
  const rows = lines.slice(2).map(parse);
  return { headers, rows };
}

function ComparisonTable({ markdown }: { markdown: string }) {
  const { headers, rows } = parseMarkdownTable(markdown);
  
  // If it's a pure table, render structured
  if (headers.length > 0 && !markdown.trim().startsWith("#")) {
    return (
      <div className="max-h-[500px] overflow-y-auto rounded-lg border border-border">
        <Table className="table-auto">
          <TableHeader>
            <TableRow className="bg-muted/50">
              {headers.map((h, i) => (
                <TableHead key={i} className="text-[11px] font-semibold whitespace-nowrap px-3 py-2">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={ri} className={ri % 2 === 0 ? "" : "bg-muted/20"}>
                {row.map((cell, ci) => (
                  <TableCell key={ci} className="text-[11px] px-3 py-2 whitespace-normal">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Mixed content (headings + tables + text) — use ReactMarkdown
  return (
    <div className="max-h-[600px] overflow-y-auto space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-foreground border-b border-border pb-2 mb-3">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-foreground mt-4 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-foreground mt-3 mb-2">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold text-foreground mt-2 mb-1">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-4 space-y-1 text-xs text-muted-foreground mb-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-4 space-y-1 text-xs text-muted-foreground mb-2">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-border my-2">
              <table className="w-full text-[11px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-primary/10">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border whitespace-nowrap">{children}</th>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="even:bg-muted/30 hover:bg-muted/50 transition-colors">{children}</tr>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-muted-foreground whitespace-normal">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-primary pl-3 py-1 my-2 bg-primary/5 rounded-r-lg text-xs">{children}</blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-muted px-1 py-0.5 rounded text-[10px] font-mono text-foreground">{children}</code>
          ),
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export function P9BenchmarkOverview({ categoryId }: P9BenchmarkOverviewProps) {
  const { data: brief, isLoading, error } = useFormulaBrief(categoryId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading formula brief...
      </div>
    );
  }

  if (error || !brief?.ingredients) {
    return (
      <div className="flex items-center gap-2 text-sm text-chart-2 p-4 bg-chart-2/10 rounded-xl border border-chart-2/20">
        <AlertCircle className="h-4 w-4 shrink-0" />
        No formula brief yet — run P9 + P10 for this category first
      </div>
    );
  }

  const ing = brief.ingredients;
  const qaVerdict = ing.qa_verdict;
  const comparison = ing.comprehensive_comparison;
  const adjustedFormula = ing.adjusted_formula;
  const finalBrief = ing.final_formula_brief || ing.ai_generated_brief_claude || ing.ai_generated_brief_grok || ing.ai_generated_brief;
  const keyword = ing.keyword || "this category";

  return (
    <div className="space-y-4">

      {/* QA Verdict Banner */}
      {qaVerdict && (
        <Card className="border-chart-4/30 bg-chart-4/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-chart-4">
              <Trophy className="h-4 w-4" />
              P10 Formula QA Verdict
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground leading-relaxed">{qaVerdict.summary}</p>
            {qaVerdict.score && (
              <Badge className="mt-2" variant="outline">Score: {qaVerdict.score}/10</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Competitor Comparison Table */}
      {comparison && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-primary" />
              DOVIVE vs Top Competitors — Formula Benchmark
            </CardTitle>
            <CardDescription className="text-xs">
              AI-generated comparison from P10 QA for {keyword}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <ComparisonTable markdown={comparison} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Adjusted Formula */}
      {adjustedFormula && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              Recommended DOVIVE Formula — QA Adjusted
            </CardTitle>
            <CardDescription className="text-xs">
              Final formula spec from P10 adjudication
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <ComparisonTable markdown={adjustedFormula} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {brief.target_price && (
                <div className="p-2 rounded-lg border border-border bg-muted/40">
                  <p className="text-sm font-bold text-foreground">${brief.target_price.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">Target Price</p>
                </div>
              )}
              {brief.servings_per_container && (
                <div className="p-2 rounded-lg border border-border bg-muted/40">
                  <p className="text-sm font-bold text-foreground">{brief.servings_per_container}</p>
                  <p className="text-[10px] text-muted-foreground">Servings</p>
                </div>
              )}
              {brief.form_type && (
                <div className="p-2 rounded-lg border border-border bg-muted/40">
                  <p className="text-sm font-bold text-foreground capitalize">{brief.form_type}</p>
                  <p className="text-[10px] text-muted-foreground">Form</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full AI Brief (collapsed) */}
      {finalBrief && !adjustedFormula && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-primary" />
              Full Formula Brief
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed bg-muted/30 p-3 rounded-lg border border-border max-h-[500px] overflow-y-auto">
              {finalBrief.slice(0, 5000)}{finalBrief.length > 5000 ? "\n\n... (truncated)" : ""}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
