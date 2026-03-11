/**
 * P9BenchmarkOverview — Competitor benchmark summary from P9 QA findings
 * Shows DOVIVE vs top competitors with our formula advantages highlighted.
 * Design system tokens only.
 */

import { Trophy, CheckCircle2, FlaskConical, DollarSign, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface P9BenchmarkOverviewProps {
  categoryId: string;
}

const DOVIVE_FORMULA = {
  ingredients: ["KSM-66 Ashwagandha 400mg", "L-Theanine 100mg", "Vitamin D3 25mcg"],
  msrp: "$21.99–$22.99",
  verdict: "APPROVED — PREMIUM BUILD",
  score: "8/10",
  positioning: "Premium stress + calm gummy — KSM-66 + L-Theanine synergy",
};

const COMPETITORS = [
  {
    brand: "Goli",
    bsr: "420",
    price: "$14.96",
    theirFormula: "300mg KSM-66, with sugar",
    ourAdvantage: "Higher dose (400mg) + sugar-free + L-Theanine blend",
    canWin: true,
  },
  {
    brand: "Goli",
    bsr: "445",
    price: "$28.46",
    theirFormula: "KSM-66 (dose unspecified)",
    ourAdvantage: "Transparent dosing + lower price + L-Theanine",
    canWin: true,
  },
  {
    brand: "OLLY",
    bsr: "1,174",
    price: "$11.47",
    theirFormula: "Unspecified ashwagandha, with sugar",
    ourAdvantage: "Premium KSM-66 + sugar-free + third-party tested",
    canWin: true,
  },
  {
    brand: "Adndale",
    bsr: "1,447",
    price: "$25.83",
    theirFormula: "Unspecified + overcrowded blend",
    ourAdvantage: "Focused premium formula at lower cost",
    canWin: true,
  },
  {
    brand: "Youtheory",
    bsr: "2,929",
    price: "$16.79",
    theirFormula: "1000mg KSM-66 (capsule)",
    ourAdvantage: "Gummy format + L-Theanine synergy + sugar-free",
    canWin: null, // maybe
  },
  {
    brand: "Gaia Herbs",
    bsr: "4,375",
    price: "$25.19",
    theirFormula: "350mg organic ashwagandha",
    ourAdvantage: "Higher dose (400mg) + L-Theanine + lower price",
    canWin: true,
  },
  {
    brand: "Nature Made",
    bsr: "4,573",
    price: "$16.99",
    theirFormula: "125mg Sensoril (capsule)",
    ourAdvantage: "3× higher dose + gummy format + L-Theanine",
    canWin: true,
  },
  {
    brand: "OLLY",
    bsr: "2,292",
    price: "$19.99",
    theirFormula: "Unspecified ashwagandha, with sugar",
    ourAdvantage: "KSM-66 transparency + sugar-free + L-Theanine",
    canWin: true,
  },
];

export function P9BenchmarkOverview({ categoryId }: P9BenchmarkOverviewProps) {
  const wins = COMPETITORS.filter(c => c.canWin === true).length;
  const maybes = COMPETITORS.filter(c => c.canWin === null).length;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-chart-2" />
          <CardTitle>Benchmark Overview — QA Verified</CardTitle>
          <Badge className="bg-chart-2/10 text-chart-2 border border-chart-2/30 text-xs">P9 QA</Badge>
        </div>
        <CardDescription>
          How DOVIVE stacks up against top competitors based on P9 formula QA analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Our Formula Summary */}
        <div className="rounded-lg border-2 border-chart-2/40 bg-chart-2/5 p-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FlaskConical className="w-4 h-4 text-chart-2" />
                <span className="font-semibold text-foreground">DOVIVE Formula (P9 Approved)</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {DOVIVE_FORMULA.ingredients.map((ing, i) => (
                  <Badge key={i} variant="outline" className="text-xs border-chart-2/30 text-chart-2">
                    ✓ {ing}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground italic">{DOVIVE_FORMULA.positioning}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 justify-end mb-1">
                <DollarSign className="w-4 h-4 text-chart-2" />
                <span className="font-bold text-foreground">{DOVIVE_FORMULA.msrp}</span>
              </div>
              <Badge className="bg-chart-4/10 text-chart-4 border border-chart-4/30 text-xs">
                <Award className="w-3 h-3 mr-1" />
                {DOVIVE_FORMULA.verdict} {DOVIVE_FORMULA.score}
              </Badge>
            </div>
          </div>
        </div>

        {/* Win Rate Summary */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chart-4/10 border border-chart-4/20">
            <CheckCircle2 className="w-4 h-4 text-chart-4" />
            <span className="text-sm font-semibold text-chart-4">{wins} Clear Wins</span>
          </div>
          {maybes > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chart-2/10 border border-chart-2/20">
              <span className="text-sm font-semibold text-chart-2">{maybes} Competitive</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
            <span className="text-sm text-muted-foreground">vs {COMPETITORS.length} top competitors</span>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Competitor</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">BSR</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Price</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium">Their Formula</th>
                <th className="text-left py-2 pl-3 text-muted-foreground font-medium">Our Advantage</th>
              </tr>
            </thead>
            <tbody>
              {COMPETITORS.map((c, idx) => (
                <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-3 font-medium">{c.brand}</td>
                  <td className="text-right py-2 px-2 text-muted-foreground text-xs">#{c.bsr}</td>
                  <td className="text-right py-2 px-2 font-medium">{c.price}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{c.theirFormula}</td>
                  <td className="py-2 pl-3">
                    <div className="flex items-start gap-1.5">
                      {c.canWin === true && <CheckCircle2 className="w-3.5 h-3.5 text-chart-4 mt-0.5 flex-shrink-0" />}
                      {c.canWin === null && <span className="text-chart-2 text-xs mt-0.5 flex-shrink-0">~</span>}
                      <span className="text-xs text-foreground">{c.ourAdvantage}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">P9 QA Verdict: </span>
          Formula verified. L-Theanine retained as premium differentiator per DOVIVE brand directive.
          DOVIVE targets <span className="font-medium text-foreground">$21.99–$22.99</span> — above Goli ($14.96), below Adndale ($25.83).
          Strategic rule: always compete premium, never strip differentiators to match Goli.
        </div>

      </CardContent>
    </Card>
  );
}

export default P9BenchmarkOverview;
