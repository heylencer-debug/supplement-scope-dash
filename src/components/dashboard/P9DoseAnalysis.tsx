/**
 * P9DoseAnalysis — Ingredients & Dosage Comparison
 * DOVIVE formula vs clinical range vs market average, P9 QA verified.
 * Design system tokens only.
 */

import { Pill, CheckCircle2, XCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface P9DoseAnalysisProps {
  categoryId: string;
}

type DoseVerdict = "optimal" | "effective" | "standard" | "removed";

interface DoseRow {
  ingredient: string;
  doviveDose: string;
  clinicalRange: string;
  marketAvg: string;
  verdict: DoseVerdict;
  verdictLabel: string;
  notes: string;
  kept: boolean;
}

const DOSE_ROWS: DoseRow[] = [
  {
    ingredient: "KSM-66 Ashwagandha",
    doviveDose: "400mg",
    clinicalRange: "300–600mg/day",
    marketAvg: "300–1000mg (Goli: 300mg, Youtheory: 1000mg)",
    verdict: "optimal",
    verdictLabel: "✅ Optimal",
    notes: "Beats Goli (300mg). Within gummy active load limits. Clinically proven for stress relief.",
    kept: true,
  },
  {
    ingredient: "L-Theanine",
    doviveDose: "100mg",
    clinicalRange: "100–400mg/day",
    marketAvg: "50–100mg (OLLY, Adndale)",
    verdict: "effective",
    verdictLabel: "✅ Effective",
    notes: "Premium differentiator. OLLY & Adndale use it. Synergistic with ashwagandha for HPA axis support. Retained per DOVIVE premium brand directive.",
    kept: true,
  },
  {
    ingredient: "Vitamin D3",
    doviveDose: "25mcg (1000 IU)",
    clinicalRange: "20–50mcg/day",
    marketAvg: "25mcg (matches Goli)",
    verdict: "standard",
    verdictLabel: "✅ Standard",
    notes: "Matches market leader. Mood + immune support positioning. Heat-sensitive — validate with CMO.",
    kept: true,
  },
  {
    ingredient: "Lemon Balm Extract",
    doviveDose: "Removed",
    clinicalRange: "60–120mg (5:1 extract)",
    marketAvg: "50mg (OLLY, Adndale)",
    verdict: "removed",
    verdictLabel: "❌ Removed",
    notes: "Was 50mg — sub-therapeutic (below 60mg effective minimum). Removed to keep total actives ≤500mg.",
    kept: false,
  },
  {
    ingredient: "Magnesium (as Citrate)",
    doviveDose: "Removed",
    clinicalRange: "200–400mg/day",
    marketAvg: "20–400mg (widely variable)",
    verdict: "removed",
    verdictLabel: "❌ Removed",
    notes: "Was 20mg — insignificant for stress relief (14× below effective dose). Removed to reduce active load.",
    kept: false,
  },
];

const VERDICT_STYLES: Record<DoseVerdict, string> = {
  optimal:   "bg-chart-4/10 text-chart-4 border-chart-4/30",
  effective: "bg-primary/10 text-primary border-primary/30",
  standard:  "bg-muted text-muted-foreground border-border",
  removed:   "bg-destructive/10 text-destructive border-destructive/30",
};

export function P9DoseAnalysis({ categoryId }: P9DoseAnalysisProps) {
  const keptCount = DOSE_ROWS.filter(r => r.kept).length;
  const removedCount = DOSE_ROWS.filter(r => !r.kept).length;
  const totalActive = "500mg"; // KSM-66 400mg + L-Theanine 100mg

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Pill className="w-5 h-5 text-primary" />
          <CardTitle>Ingredients & Dosage Comparison</CardTitle>
          <Badge className="bg-chart-4/10 text-chart-4 border border-chart-4/30 text-xs">P9 Verified</Badge>
        </div>
        <CardDescription>
          DOVIVE formula vs clinical effective range vs market average — all doses QA reviewed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-chart-4/10 border border-chart-4/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-chart-4" />
            <span className="text-sm text-chart-4 font-medium">{keptCount} ingredients kept</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <XCircle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-sm text-destructive font-medium">{removedCount} removed (sub-therapeutic)</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border">
            <span className="text-sm text-muted-foreground">Total actives: {totalActive} per serving</span>
          </div>
        </div>

        {/* Dose Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium min-w-[140px]">Ingredient</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">DOVIVE Dose</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">Clinical Range</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">Market Avg</th>
                <th className="text-center py-2 px-2 text-muted-foreground font-medium">Verdict</th>
                <th className="text-left py-2 pl-3 text-muted-foreground font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {DOSE_ROWS.map((row, idx) => (
                <tr key={idx} className={`border-b border-border/50 ${!row.kept ? "opacity-75" : ""}`}>
                  <td className="py-3 pr-3">
                    <span className={`font-medium ${row.kept ? "text-foreground" : "text-muted-foreground line-through"}`}>
                      {row.ingredient}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`font-semibold ${row.kept ? "text-foreground" : "text-muted-foreground"}`}>
                      {row.doviveDose}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center text-xs text-muted-foreground">{row.clinicalRange}</td>
                  <td className="py-3 px-2 text-center text-xs text-muted-foreground">{row.marketAvg}</td>
                  <td className="py-3 px-2 text-center">
                    <Badge variant="outline" className={`text-xs ${VERDICT_STYLES[row.verdict]}`}>
                      {row.verdictLabel}
                    </Badge>
                  </td>
                  <td className="py-3 pl-3 text-xs text-muted-foreground max-w-[220px]">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-chart-4/5 border border-chart-4/20 p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-chart-4 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-foreground space-y-0.5">
            <p>
              <span className="font-semibold">Total active load: 500mg per serving</span> — at the gummy manufacturing limit.
              All 3 retained ingredients are clinically effective at their doses.
            </p>
            <p className="text-muted-foreground">
              CMO validation required: Vitamin D3 stability under heat processing + active load texture testing.
              Certifications required: Vegan | Non-GMO | Gluten-Free | Third-Party Tested.
            </p>
          </div>
        </div>

        {/* Verdict Footer */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <span className="text-sm text-muted-foreground">P9 QA Score</span>
          <Badge className="bg-chart-4/10 text-chart-4 border border-chart-4/30">
            8/10 — APPROVED PREMIUM BUILD
          </Badge>
        </div>

      </CardContent>
    </Card>
  );
}

export default P9DoseAnalysis;
