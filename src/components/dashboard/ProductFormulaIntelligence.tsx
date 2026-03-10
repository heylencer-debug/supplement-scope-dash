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
import { AlertCircle, FlaskConical, ShieldCheck, Zap, TrendingUp, DollarSign, Star, Award } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

interface Props {
  categoryId: string;
}

const EXTRACT_COLORS: Record<string, string> = {
  "KSM-66":          "#6366f1",
  "Sensoril":        "#8b5cf6",
  "Shoden":          "#a855f7",
  "Organic Extract": "#22c55e",
  "Generic Extract": "#f59e0b",
  "10:1 Extract":    "#14b8a6",
  "Root Powder":     "#94a3b8",
  "Unknown":         "#475569",
};

const THREAT_COLORS: Record<string, string> = {
  "Very High": "#ef4444",
  "High":      "#f97316",
  "Medium":    "#eab308",
  "Low":       "#22c55e",
};

const QUALITY_COLORS = ["#ef4444", "#f97316", "#eab308", "#6366f1", "#22c55e"];

function StatBox({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("p-3 rounded-lg border text-center", accent ? "border-indigo-500/30 bg-indigo-500/10" : "border-slate-700/40 bg-slate-800/20")}>
      <p className={cn("text-xl font-bold tabular-nums", accent ? "text-indigo-300" : "text-slate-200")}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
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
      <div className="flex items-center gap-2 text-sm text-amber-400 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error ? "Failed to load formula intelligence" : "No P6 data yet — run phase6-product-intelligence.js first"}
      </div>
    );
  }

  const { summary } = data;
  const s = summary;

  return (
    <div className="space-y-6">

      {/* ── Formula Stats KPIs ── */}
      <Card className="border-slate-700/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
            <FlaskConical className="h-4 w-4 text-indigo-400" />
            Formula Landscape — {s.total} Products Analyzed
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
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

          {/* Formula attributes row */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: "Sugar-Free", pct: s.pct_sugar_free, color: "emerald" },
              { label: "Vegan", pct: s.pct_vegan, color: "green" },
              { label: "Non-GMO", pct: s.pct_non_gmo, color: "lime" },
              { label: "3rd Party Tested", pct: s.pct_third_party, color: "blue" },
              { label: "cGMP", pct: s.pct_cgmp, color: "violet" },
              { label: "No Artificial Colors", pct: s.pct_no_artificial, color: "amber" },
            ].map(attr => (
              <div key={attr.label} className="p-2 rounded-lg border border-slate-700/30 bg-slate-800/20 text-center">
                <p className="text-sm font-bold text-slate-200">{attr.pct}%</p>
                <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{attr.label}</p>
                <div className="h-1 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${attr.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Extract Type + Dosage Distribution ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Extract Type Pie */}
        <Card className="border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
              <FlaskConical className="h-4 w-4" />
              Extract Type Distribution
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Quality of ashwagandha used across the category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={s.extract_distribution}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {s.extract_distribution.map((entry) => (
                    <Cell key={entry.label} fill={EXTRACT_COLORS[entry.label] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number, name: string) => [`${val} products (${Math.round(val / s.total * 100)}%)`, name]}
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 12 }}
                />
                <Legend
                  formatter={(value) => <span style={{ fontSize: 11, color: "#cbd5e1" }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* KSM-66 callout */}
            <div className="mt-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <p className="text-xs text-indigo-300">
                <span className="font-semibold">KSM-66</span> is the gold standard — only{" "}
                {s.extract_distribution.find(e => e.label === "KSM-66")?.pct || 0}% of products use it.
                Dovive should lead with KSM-66 as a primary differentiator.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Dosage Buckets */}
        <Card className="border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
              <TrendingUp className="h-4 w-4" />
              Ashwagandha Dosage Distribution
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Clinical dose is 300–600mg/day of KSM-66 (standardized 5% withanolides)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={s.dosage_buckets} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip
                  formatter={(val: number) => [`${val} products`, "Count"]}
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {s.dosage_buckets.map((b, i) => (
                    <Cell
                      key={b.label}
                      fill={b.min >= 300 && b.max <= 999 ? "#6366f1" : b.min >= 1000 ? "#22c55e" : "#475569"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-2 mt-2 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" /> Clinical range</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> High dose</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-600 inline-block" /> Below clinical</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Certifications + Bonus Ingredients ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Certifications */}
        <Card className="border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Certification Prevalence
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              % of products with each certification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {s.cert_frequency.slice(0, 10).map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 w-36 shrink-0 truncate">{c.label}</span>
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-10 text-right tabular-nums">{c.pct}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bonus Ingredients */}
        <Card className="border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
              <Zap className="h-4 w-4 text-amber-400" />
              Bonus Ingredients
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Most common active ingredients paired with ashwagandha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={s.bonus_frequency.slice(0, 10)}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                <Tooltip
                  formatter={(val: number) => [`${val} products`, "Count"]}
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 12 }}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Formula Quality + Threat Distribution ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formula Quality */}
        <Card className="border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
              <Award className="h-4 w-4 text-violet-400" />
              Formula Quality Distribution
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Scored 1–10 based on extract quality, dose, and third-party testing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={s.quality_buckets} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip
                  formatter={(val: number) => [`${val} products`, "Count"]}
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {s.quality_buckets.map((_, i) => (
                    <Cell key={i} fill={QUALITY_COLORS[i % QUALITY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-center text-slate-500 mt-1">
              Avg: <span className="text-slate-300 font-medium">{s.avg_quality_score}/10</span> — most products score below 6, leaving room for Dovive to lead on formula quality
            </p>
          </CardContent>
        </Card>

        {/* Threat Distribution */}
        <Card className="border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
              <TrendingUp className="h-4 w-4 text-red-400" />
              Competitor Threat Levels
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Based on BSR rank, formula quality, and rating
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mt-2">
              {s.threat_distribution.map((t) => (
                <div key={t.label} className="flex items-center gap-3">
                  <span
                    className="text-xs font-semibold w-20 shrink-0"
                    style={{ color: t.color }}
                  >
                    {t.label}
                  </span>
                  <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${t.pct}%`, background: t.color }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-16 text-right tabular-nums">
                    {t.count} ({t.pct}%)
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Most competitors are Medium/Low threat — Dovive can compete with a solid formula + KSM-66
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Top 10 by Formula Score ── */}
      <Card className="border-slate-700/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
            <Star className="h-4 w-4 text-yellow-400" />
            Top 10 by Formula Quality Score
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Strongest competitor formulas — study and beat these
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/40">
                  <th className="text-left py-2 pr-3 text-xs text-slate-500 font-medium">#</th>
                  <th className="text-left py-2 pr-3 text-xs text-slate-500 font-medium">Brand</th>
                  <th className="text-left py-2 pr-3 text-xs text-slate-500 font-medium">Extract</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Dose</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">Score</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">BSR</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">$/Serving</th>
                  <th className="text-left py-2 pl-3 text-xs text-slate-500 font-medium">Threat</th>
                </tr>
              </thead>
              <tbody>
                {s.top_by_formula.map((p, i) => (
                  <tr key={p.asin} className="border-b border-slate-700/20 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 text-xs text-slate-500">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {p.main_image_url && (
                          <img src={p.main_image_url} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                        )}
                        <span className="text-xs font-medium text-slate-200 truncate max-w-[100px]">{p.brand || "—"}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5"
                        style={{
                          color: EXTRACT_COLORS[p.intel.ashwagandha_extract_type] || "#94a3b8",
                          borderColor: EXTRACT_COLORS[p.intel.ashwagandha_extract_type] || "#475569",
                        }}
                      >
                        {p.intel.ashwagandha_extract_type}
                      </Badge>
                    </td>
                    <td className="text-right py-2 px-3 text-xs text-slate-300 tabular-nums">
                      {p.intel.ashwagandha_amount_mg ? `${p.intel.ashwagandha_amount_mg}mg` : "—"}
                    </td>
                    <td className="text-right py-2 px-3">
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color: p.intel.formula_quality_score >= 8 ? "#22c55e" : p.intel.formula_quality_score >= 6 ? "#eab308" : "#ef4444" }}
                      >
                        {p.intel.formula_quality_score}/10
                      </span>
                    </td>
                    <td className="text-right py-2 px-3 text-xs text-slate-400 tabular-nums">
                      #{p.bsr_current?.toLocaleString() || "—"}
                    </td>
                    <td className="text-right py-2 px-3 text-xs text-slate-300 tabular-nums">
                      {p.intel.price_per_serving ? `$${p.intel.price_per_serving.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2 pl-3">
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: THREAT_COLORS[p.intel.competitor_threat_level] || "#94a3b8" }}
                      >
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

      {/* ── KSM-66 Products ── */}
      {s.ksm66_products.length > 0 && (
        <Card className="border-indigo-500/20 bg-indigo-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-indigo-300">
              <FlaskConical className="h-4 w-4" />
              KSM-66 Competitors to Beat
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              These use the same premium extract Dovive should use — direct competition
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {s.ksm66_products.map((p) => (
                <div key={p.asin} className="flex items-center gap-3 p-2.5 rounded-lg border border-indigo-500/15 bg-indigo-500/5">
                  {p.main_image_url && (
                    <img src={p.main_image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{p.brand}</p>
                    <p className="text-xs text-slate-400">{p.intel.ashwagandha_amount_mg}mg · {p.intel.withanolide_percentage || "?"} withanolides</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-500">BSR #{p.bsr_current?.toLocaleString()}</span>
                      {p.intel.price_per_serving && (
                        <span className="text-[10px] text-slate-500">${p.intel.price_per_serving.toFixed(2)}/serving</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold" style={{ color: p.intel.formula_quality_score >= 8 ? "#22c55e" : "#eab308" }}>
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
