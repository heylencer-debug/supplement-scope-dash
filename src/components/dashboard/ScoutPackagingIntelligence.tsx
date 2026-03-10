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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";

interface Props { categoryId: string; }

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-5))", "hsl(var(--chart-3))",
  "hsl(var(--chart-2))", "hsl(var(--chart-4))", "hsl(var(--primary))",
  "hsl(var(--chart-1)/0.7)", "hsl(var(--chart-5)/0.7)",
];

const COLOR_PILL_MAP: Record<string, string> = {
  "Green / Natural":  "bg-chart-4/15 text-chart-4 border-chart-4/20",
  "Purple / Violet":  "bg-chart-5/15 text-chart-5 border-chart-5/20",
  "White / Clean":    "bg-muted text-muted-foreground border-border",
  "Orange / Gold":    "bg-chart-2/15 text-chart-2 border-chart-2/20",
  "Pink / Berry":     "bg-destructive/10 text-destructive border-destructive/20",
  "Blue / Teal":      "bg-chart-3/15 text-chart-3 border-chart-3/20",
  "Black / Premium":  "bg-foreground/10 text-foreground border-border",
};

function ColorPill({ color }: { color: string }) {
  const cls = COLOR_PILL_MAP[color] || "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", cls)}>
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
      <div className="flex items-center gap-2 text-sm text-destructive p-4 bg-destructive/10 rounded-xl border border-destructive/20">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Failed to load packaging intelligence
      </div>
    );
  }

  const { summary } = data;

  if (summary.products_analyzed === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No P7 packaging data yet. Run <code className="text-foreground">node phase7-packaging-intelligence.js</code> first.</p>
      </div>
    );
  }

  const strat = summary.dovive_strategy;

  return (
    <div className="space-y-6">

      {/* Dovive Strategy Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-primary">
            <Target className="h-4 w-4" />
            Dovive Packaging Strategy
          </CardTitle>
          <CardDescription className="text-xs">
            Based on {summary.products_analyzed} competitor products — what to claim, what to avoid, what to own
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/15">
            <p className="flex items-start gap-2 text-sm text-foreground">
              <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-chart-2" />
              {strat.key_insight}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Lead with */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-chart-4 uppercase tracking-wide">Lead With</p>
              <div className="px-3 py-2 rounded-lg bg-chart-4/10 border border-chart-4/20">
                <p className="text-sm font-medium text-foreground">{strat.primary_claim}</p>
              </div>
              {strat.claims_to_own.length > 0 && (
                <div className="space-y-1">
                  {strat.claims_to_own.map((c) => (
                    <div key={c} className="px-2 py-1 rounded bg-chart-4/5 border border-chart-4/10">
                      <p className="text-xs text-chart-4">+ {c}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Badges to feature */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-chart-3 uppercase tracking-wide">Badges to Feature</p>
              {strat.badges_to_feature.length > 0 ? (
                <div className="space-y-1">
                  {strat.badges_to_feature.map((b) => (
                    <div key={b} className="flex items-center gap-2 px-2 py-1.5 rounded bg-chart-3/10 border border-chart-3/20">
                      <ShieldCheck className="h-3 w-3 text-chart-3 shrink-0" />
                      <p className="text-xs text-foreground">{b}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Standard badges sufficient</p>
              )}
            </div>

            {/* Color direction + avoid */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-chart-2 uppercase tracking-wide">Color Direction</p>
              <ColorPill color={strat.color_direction} />
              <p className="text-xs text-muted-foreground mt-1">{strat.color_rationale}</p>
              {strat.claims_to_avoid.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide mt-2">Avoid (Saturated)</p>
                  {strat.claims_to_avoid.map((c) => (
                    <div key={c} className="px-2 py-1 rounded bg-destructive/5 border border-destructive/10">
                      <p className="text-xs text-destructive/70 line-through">{c}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Benefit Claim Frequency */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            Benefit Claim Frequency
          </CardTitle>
          <CardDescription className="text-xs">
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
              <XAxis
                type="number" domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                type="category" dataKey="label" width={160}
                tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              />
              <Tooltip
                formatter={(val: number) => [`${val}%`, "Frequency"]}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                  color: "hsl(var(--foreground))",
                }}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {summary.benefit_frequency.slice(0, 10).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Badge Frequency */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Badge / Trust Claims
            </CardTitle>
            <CardDescription className="text-xs">% of competitors showing each badge</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.badge_frequency.slice(0, 10).map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs text-foreground truncate">{b.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums ml-2">{b.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${b.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Color Palette + Opportunity Gaps */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Palette className="h-4 w-4 text-primary" />
                Color Palette Signals
              </CardTitle>
              <CardDescription className="text-xs">Inferred from title + claim keywords</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {summary.color_frequency.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5">
                    <ColorPill color={c.label} />
                    <span className="text-xs text-muted-foreground">{c.pct}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-chart-4/20 bg-chart-4/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-chart-4">
                <Lightbulb className="h-4 w-4" />
                Opportunity Gaps
              </CardTitle>
              <CardDescription className="text-xs">
                Claims &lt;15% of competitors use — Dovive can own these
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {summary.opportunity_gaps.slice(0, 6).map((g) => (
                  <div key={g.label} className="flex items-center justify-between px-2 py-1.5 rounded bg-chart-4/10 border border-chart-4/15">
                    <span className="text-xs text-foreground">{g.label}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] border-chart-4/30 text-chart-4 px-1.5 py-0">
                        {g.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{g.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top Packagers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Star className="h-4 w-4 text-chart-2" />
            Top Packagers by Messaging Score
          </CardTitle>
          <CardDescription className="text-xs">
            Competitors with strongest packaging message — study these
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {summary.top_packagers.map((p, i) => (
              <div key={p.asin} className="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                <span className="text-xs font-bold text-muted-foreground w-4 shrink-0 mt-0.5">#{i + 1}</span>
                {p.main_image_url && (
                  <img src={p.main_image_url} alt={p.brand || ""} className="w-10 h-10 object-cover rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{p.brand || "Unknown"}</span>
                    <Badge className="text-[10px] bg-chart-5/15 text-chart-5 border-chart-5/30 px-1.5">
                      Score {p.packaging.messaging_score}/10
                    </Badge>
                    {p.packaging.primary_benefit_claim && (
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {p.packaging.primary_benefit_claim}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.packaging.headline_hook}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.packaging.badge_claims.slice(0, 4).map((b) => (
                      <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">{b}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">BSR</p>
                  <p className="text-sm font-medium text-foreground">{p.bsr_current?.toLocaleString() || "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
