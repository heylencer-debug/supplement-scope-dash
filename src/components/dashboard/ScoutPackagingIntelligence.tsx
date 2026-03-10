/**
 * ScoutPackagingIntelligence
 * Displays P7 packaging analysis from Scout — claims, badges, colors, and Dovive strategy.
 * Data sourced entirely from products.marketing_analysis.packaging_intelligence in Supabase.
 */

import { useScoutPackagingData } from "@/hooks/useScoutPackagingData";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Target, TrendingUp, Palette, ShieldCheck, Lightbulb, Star } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/utils";

interface Props {
  categoryId: string;
}

const CLAIM_COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#7c3aed",
  "#4f46e5", "#818cf8", "#c4b5fd", "#ddd6fe",
];

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  "Green / Natural":  { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  "Purple / Violet":  { bg: "bg-violet-500/20",  text: "text-violet-400"  },
  "White / Clean":    { bg: "bg-slate-500/20",   text: "text-slate-300"   },
  "Orange / Gold":    { bg: "bg-amber-500/20",   text: "text-amber-400"   },
  "Pink / Berry":     { bg: "bg-pink-500/20",    text: "text-pink-400"    },
  "Blue / Teal":      { bg: "bg-cyan-500/20",    text: "text-cyan-400"    },
  "Black / Premium":  { bg: "bg-gray-700/40",    text: "text-gray-300"    },
};

function ColorPill({ color }: { color: string }) {
  const style = COLOR_MAP[color] || { bg: "bg-slate-700/20", text: "text-slate-400" };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border border-white/5", style.bg, style.text)}>
      {color}
    </span>
  );
}

export function ScoutPackagingIntelligence({ categoryId }: Props) {
  const { data, isLoading, error } = useScoutPackagingData(categoryId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-400 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Failed to load packaging intelligence
      </div>
    );
  }

  const { summary } = data;

  if (summary.products_analyzed === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>No P7 packaging data yet. Run <code className="text-slate-300">node phase7-packaging-intelligence.js</code> first.</p>
      </div>
    );
  }

  const strat = summary.dovive_strategy;

  return (
    <div className="space-y-6">

      {/* ── Dovive Strategy Card ── */}
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-violet-300">
            <Target className="h-4 w-4" />
            Dovive Packaging Strategy
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Based on {summary.products_analyzed} competitor products — what to claim, what to avoid, what to own
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key insight */}
          <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <p className="flex items-start gap-2 text-sm text-violet-200">
              <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-yellow-400" />
              {strat.key_insight}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Lead with */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Lead With</p>
              <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm font-medium text-emerald-200">{strat.primary_claim}</p>
              </div>
              {strat.claims_to_own.length > 0 && (
                <div className="space-y-1">
                  {strat.claims_to_own.map((c) => (
                    <div key={c} className="px-2 py-1 rounded bg-emerald-500/5 border border-emerald-500/10">
                      <p className="text-xs text-emerald-300">+ {c}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Badges to feature */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Badges to Feature</p>
              {strat.badges_to_feature.length > 0 ? (
                <div className="space-y-1">
                  {strat.badges_to_feature.map((b) => (
                    <div key={b} className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                      <ShieldCheck className="h-3 w-3 text-blue-400 shrink-0" />
                      <p className="text-xs text-blue-200">{b}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Standard badges sufficient</p>
              )}
            </div>

            {/* Color + avoid */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Color Direction</p>
              <ColorPill color={strat.color_direction} />
              <p className="text-xs text-slate-400 mt-1">{strat.color_rationale}</p>
              {strat.claims_to_avoid.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mt-2">Avoid (Saturated)</p>
                  {strat.claims_to_avoid.map((c) => (
                    <div key={c} className="px-2 py-1 rounded bg-red-500/5 border border-red-500/10">
                      <p className="text-xs text-red-400 line-through opacity-70">{c}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Benefit Claim Frequency ── */}
      <Card className="border-slate-700/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
            <TrendingUp className="h-4 w-4" />
            Benefit Claim Frequency
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            What % of competitors claim each benefit on packaging
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={summary.benefit_frequency.slice(0, 10)}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 10, bottom: 0 }}
            >
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11, fill: "#cbd5e1" }} />
              <Tooltip
                formatter={(val: number) => [`${val}%`, "Frequency"]}
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 12 }}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {summary.benefit_frequency.slice(0, 10).map((_, i) => (
                  <Cell key={i} fill={CLAIM_COLORS[i % CLAIM_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Badge Frequency ── */}
        <Card className="border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
              <ShieldCheck className="h-4 w-4" />
              Badge / Trust Claims
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              % of competitors showing each badge
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.badge_frequency.slice(0, 10).map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs text-slate-300 truncate">{b.label}</span>
                      <span className="text-xs text-slate-400 tabular-nums ml-2">{b.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${b.pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Color Palette + Opportunity Gaps ── */}
        <div className="space-y-4">
          <Card className="border-slate-700/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
                <Palette className="h-4 w-4" />
                Color Palette Signals
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Inferred from title + claim keywords
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {summary.color_frequency.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5">
                    <ColorPill color={c.label} />
                    <span className="text-xs text-slate-500">{c.pct}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-emerald-300">
                <Lightbulb className="h-4 w-4" />
                Opportunity Gaps
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Claims &lt;15% of competitors use — Dovive can own these
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {summary.opportunity_gaps.slice(0, 6).map((g) => (
                  <div key={g.label} className="flex items-center justify-between px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/15">
                    <span className="text-xs text-emerald-200">{g.label}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 px-1.5 py-0">
                        {g.type}
                      </Badge>
                      <span className="text-xs text-slate-400">{g.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Top Packagers ── */}
      <Card className="border-slate-700/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
            <Star className="h-4 w-4 text-yellow-400" />
            Top Packagers by Messaging Score
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Competitors with strongest packaging message — study these
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {summary.top_packagers.map((p, i) => (
              <div key={p.asin} className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-700/30 bg-slate-800/20">
                <span className="text-xs font-bold text-slate-500 w-4 shrink-0 mt-0.5">#{i + 1}</span>
                {p.main_image_url && (
                  <img src={p.main_image_url} alt={p.brand || ""} className="w-10 h-10 object-cover rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">{p.brand || "Unknown"}</span>
                    <Badge className="text-[10px] bg-violet-500/20 text-violet-300 border-violet-500/30 px-1.5">
                      Score {p.packaging.messaging_score}/10
                    </Badge>
                    {p.packaging.primary_benefit_claim && (
                      <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-600 px-1.5">
                        {p.packaging.primary_benefit_claim}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{p.packaging.headline_hook}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.packaging.badge_claims.slice(0, 4).map((b) => (
                      <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 border border-slate-600/30">{b}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">BSR</p>
                  <p className="text-sm font-medium text-slate-300">{p.bsr_current?.toLocaleString() || "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
