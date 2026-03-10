/**
 * ProductFormulaIntelligence
 * Displays P6 product intelligence — formula landscape, dosages,
 * certifications, threats, bonus ingredients, and top formula products.
 * Data from products.marketing_analysis.product_intelligence
 */

import { useProductIntelligence } from "@/hooks/useProductIntelligence";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FlaskConical, ShieldCheck, Zap, TrendingUp, Star, Award } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

interface Props { categoryId: string; }

// Extract type colors — keep distinct, use chart tokens where meaningful
const EXTRACT_COLORS: Record<string, string> = {
  "KSM-66":          "hsl(var(--chart-1))",
  "Sensoril":        "hsl(var(--chart-5))",
  "Shoden":          "hsl(var(--primary))",
  "Organic Extract": "hsl(var(--chart-4))",
  "Generic Extract": "hsl(var(--chart-2))",
  "10:1 Extract":    "hsl(var(--chart-3))",
  "Root Powder":     "hsl(var(--muted-foreground))",
  "Unknown":         "hsl(var(--muted-foreground)/0.5)",
};

const THREAT_COLORS: Record<string, string> = {
  "Very High": "hsl(var(--destructive))",
  "High":      "hsl(var(--chart-2))",
  "Medium":    "hsl(var(--chart-2)/0.6)",
  "Low":       "hsl(var(--chart-4))",
};

const QUALITY_COLORS = [
  "hsl(var(--destructive))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-2)/0.7)",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-4))",
];

function StatBox({ label, value, sub, accent = false }: {
  label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div className={cn("p-3 rounded-lg border text-center", accent ? "border-primary/20 bg-primary/10" : "border-border bg-muted/40")}>
      <p className={cn("text-xl font-bold tabular-nums", accent ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

export function ProductFormulaIntelligence({ categoryId }: Props) {
  const { data, isLoading, error } = useProductIntelligence(categoryId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data || data.summary.total === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-chart-2 p-4 bg-chart-2/10 rounded-xl border border-chart-2/20">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error ? "Failed to load formula intelligence" : "No P6 data yet — run phase6-product-intelligence.js first"}
      </div>
    );
  }

  const { summary: s } = data;

  return (
    <div className="space-y-6">

      {/* Formula Stats KPIs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FlaskConical className="h-4 w-4 text-primary" />
            Formula Landscape — {s.total} Products Analyzed
          </CardTitle>
          <CardDescription className="text-xs">
            Ashwagandha dosage, extract quality, and pricing benchmarks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatBox label="Avg Ashwagandha Dose" value={s.dosage_stats.avg ? `${s.dosage_stats.avg}mg` : "—"} sub={`Range: ${s.dosage_stats.min}–${s.dosage_stats.max}mg`} accent />
            <StatBox label="Median Price/Serving" value={s.price_stats.median ? `$${s.price_stats.median.toFixed(2)}` : "—"} sub={`Range: $${s.price_stats.min?.toFixed(2)}–$${s.price_stats.max?.toFixed(2)}`} />
            <StatBox label="Avg Formula Score" value={s.avg_quality_score ? `${s.avg_quality_score}/10` : "—"} sub="Based on extract + dose + testing" />
            <StatBox label="Products w/ KSM-66" value={`${s.ksm66_products.length}`} sub={`${Math.round(s.ksm66_products.length / s.total * 100)}% of category`} accent />
          </div>

          {/* Formula attributes */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: "Sugar-Free", pct: s.pct_sugar_free },
              { label: "Vegan", pct: s.pct_vegan },
              { label: "Non-GMO", pct: s.pct_non_gmo },
              { label: "3rd Party Tested", pct: s.pct_third_party },
              { label: "cGMP", pct: s.pct_cgmp },
              { label: "No Artificial Colors", pct: s.pct_no_artificial },
            ].map(attr => (
              <div key={attr.label} className="p-2 rounded-lg border border-border bg-muted/30 text-center">
                <p className="text-sm font-bold text-foreground">{attr.pct}%</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{attr.label}</p>
                <div className="h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${attr.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Extract Type + Dosage Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-primary" />
              Extract Type Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Quality of ashwagandha used across the category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={s.extract_distribution} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {s.extract_distribution.map((entry) => (
                    <Cell key={entry.label} fill={EXTRACT_COLORS[entry.label] || "hsl(var(--muted-foreground))"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number, name: string) => [`${val} products (${Math.round(val / s.total * 100)}%)`, name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 12, color: "hsl(var(--foreground))" }}
                />
                <Legend formatter={(value) => <span style={{ fontSize: 11, color: "hsl(var(--foreground))" }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-foreground">
                <span className="font-semibold">KSM-66</span> is the gold standard — only{" "}
                {s.extract_distribution.find(e => e.label === "KSM-66")?.pct || 0}% of products use it.
                Dovive should lead with KSM-66 as a primary differentiator.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              Ashwagandha Dosage Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Clinical dose is 300–600mg/day of KSM-66 (standardized 5% withanolides)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={s.dosage_buckets} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  formatter={(val: number) => [`${val} products`, "Count"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 12, color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {s.dosage_buckets.map((b) => (
                    <Cell
                      key={b.label}
                      fill={b.min >= 300 && b.max <= 999 ? "hsl(var(--chart-1))" : b.min >= 1000 ? "hsl(var(--chart-4))" : "hsl(var(--muted-foreground)/0.5)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-chart-1 inline-block" />Clinical range</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-chart-4 inline-block" />High dose</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted-foreground/40 inline-block" />Below clinical</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Certifications + Bonus Ingredients */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-chart-4" />
              Certification Prevalence
            </CardTitle>
            <CardDescription className="text-xs">% of products with each certification</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {s.cert_frequency.slice(0, 10).map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="text-xs text-foreground w-36 shrink-0 truncate">{c.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-chart-4 rounded-full" style={{ width: `${c.pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">{c.pct}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-chart-2" />
              Bonus Ingredients
            </CardTitle>
            <CardDescription className="text-xs">
              Most common active ingredients paired with ashwagandha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={s.bonus_frequency.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                <Tooltip
                  formatter={(val: number) => [`${val} products`, "Count"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 12, color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Formula Quality + Threat Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-chart-5" />
              Formula Quality Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Scored 1–10 based on extract quality, dose, and third-party testing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={s.quality_buckets} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  formatter={(val: number) => [`${val} products`, "Count"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 12, color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {s.quality_buckets.map((_, i) => (
                    <Cell key={i} fill={QUALITY_COLORS[i % QUALITY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-center text-muted-foreground mt-1">
              Avg: <span className="text-foreground font-medium">{s.avg_quality_score}/10</span> — most products score below 6, leaving room for Dovive to lead on formula quality
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-destructive" />
              Competitor Threat Levels
            </CardTitle>
            <CardDescription className="text-xs">
              Based on BSR rank, formula quality, and rating
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mt-2">
              {s.threat_distribution.map((t) => (
                <div key={t.label} className="flex items-center gap-3">
                  <span className="text-xs font-semibold w-20 shrink-0" style={{ color: t.color }}>{t.label}</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${t.pct}%`, background: t.color }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right tabular-nums">{t.count} ({t.pct}%)</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Most competitors are Medium/Low threat — Dovive can compete with a solid formula + KSM-66
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top 10 by Formula Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Star className="h-4 w-4 text-chart-2" />
            Top 10 by Formula Quality Score
          </CardTitle>
          <CardDescription className="text-xs">Strongest competitor formulas — study and beat these</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["#", "Brand", "Extract", "Dose", "Score", "BSR", "$/Serving", "Threat"].map((h, i) => (
                    <th key={h} className={cn("py-2 text-xs text-muted-foreground font-medium", i > 2 ? "text-right px-3" : "text-left pr-3")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.top_by_formula.map((p, i) => (
                  <tr key={p.asin} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {p.main_image_url && <img src={p.main_image_url} alt="" className="w-7 h-7 rounded object-cover shrink-0" />}
                        <span className="text-xs font-medium text-foreground truncate max-w-[100px]">{p.brand || "—"}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className="text-[10px] px-1.5" style={{ color: EXTRACT_COLORS[p.intel.ashwagandha_extract_type], borderColor: EXTRACT_COLORS[p.intel.ashwagandha_extract_type] }}>
                        {p.intel.ashwagandha_extract_type}
                      </Badge>
                    </td>
                    <td className="text-right py-2 px-3 text-xs text-foreground tabular-nums">
                      {p.intel.ashwagandha_amount_mg ? `${p.intel.ashwagandha_amount_mg}mg` : "—"}
                    </td>
                    <td className="text-right py-2 px-3">
                      <span className="text-xs font-bold tabular-nums" style={{ color: p.intel.formula_quality_score >= 8 ? "hsl(var(--chart-4))" : p.intel.formula_quality_score >= 6 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))" }}>
                        {p.intel.formula_quality_score}/10
                      </span>
                    </td>
                    <td className="text-right py-2 px-3 text-xs text-muted-foreground tabular-nums">
                      #{p.bsr_current?.toLocaleString() || "—"}
                    </td>
                    <td className="text-right py-2 px-3 text-xs text-foreground tabular-nums">
                      {p.intel.price_per_serving ? `$${p.intel.price_per_serving.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2 pl-3">
                      <span className="text-[10px] font-semibold" style={{ color: THREAT_COLORS[p.intel.competitor_threat_level] }}>
                        {p.intel.competitor_threat_level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* KSM-66 Products */}
      {s.ksm66_products.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-primary">
              <FlaskConical className="h-4 w-4" />
              KSM-66 Competitors to Beat
            </CardTitle>
            <CardDescription className="text-xs">
              These use the same premium extract Dovive should use — direct competition
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {s.ksm66_products.map((p) => (
                <div key={p.asin} className="flex items-center gap-3 p-2.5 rounded-lg border border-primary/15 bg-primary/5">
                  {p.main_image_url && <img src={p.main_image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.brand}</p>
                    <p className="text-xs text-muted-foreground">{p.intel.ashwagandha_amount_mg}mg · {p.intel.withanolide_percentage || "?"} withanolides</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">BSR #{p.bsr_current?.toLocaleString()}</span>
                      {p.intel.price_per_serving && <span className="text-[10px] text-muted-foreground">${p.intel.price_per_serving.toFixed(2)}/serving</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold" style={{ color: p.intel.formula_quality_score >= 8 ? "hsl(var(--chart-4))" : "hsl(var(--chart-2))" }}>
                      {p.intel.formula_quality_score}/10
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
