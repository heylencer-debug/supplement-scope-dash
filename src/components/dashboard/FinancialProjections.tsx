import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DollarSign, TrendingUp, PiggyBank, Target, Calendar } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

interface FinancialProjectionsProps {
  financials: Record<string, unknown> | null;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--muted-foreground))",
];

export function FinancialProjections({ financials }: FinancialProjectionsProps) {
  if (!financials) return null;

  const startup_investment = financials.startup_investment as { total?: number; breakdown?: Record<string, number> } | undefined;
  const revenue_targets = financials.revenue_targets as Record<string, number> | undefined;
  const costs = financials.costs as { cogs_per_unit?: number; amazon_fees_percent?: number } | undefined;
  const breakeven = financials.breakeven as { months_to_breakeven?: number; units_to_breakeven?: number } | undefined;
  const margins = financials.margins as { year_1?: number; year_2?: number } | undefined;

  // Investment breakdown pie chart data
  const investmentData = startup_investment?.breakdown
    ? Object.entries(startup_investment.breakdown).map(([key, value], idx) => ({
        name: key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        value: value,
        fill: CHART_COLORS[idx % CHART_COLORS.length],
      }))
    : [];

  // Revenue targets timeline data
  const revenueData = revenue_targets
    ? Object.entries(revenue_targets)
        .filter(([key]) => key.startsWith("month_"))
        .map(([key, value]) => ({
          month: key.replace("month_", "M"),
          revenue: value,
        }))
        .sort((a, b) => parseInt(a.month.replace("M", "")) - parseInt(b.month.replace("M", "")))
    : [];

  const hasData = investmentData.length > 0 || revenueData.length > 0 || costs || breakeven || margins;

  if (!hasData) return null;

  return (
    <Card className="border-chart-4/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-chart-4" />
          Financial Projections
        </CardTitle>
        <CardDescription>Startup investment, revenue targets, and margin projections</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Startup Investment Breakdown */}
          {(investmentData.length > 0 || startup_investment?.total) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <PiggyBank className="w-4 h-4 text-primary" />
                  Startup Investment
                </h4>
                {startup_investment?.total && (
                  <Badge variant="outline" className="text-chart-4">
                    ${startup_investment.total.toLocaleString()} total
                  </Badge>
                )}
              </div>
              {investmentData.length > 0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={investmentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `$${(value / 1000).toFixed(0)}K`}
                      labelLine={false}
                    >
                      {investmentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {investmentData.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {investmentData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Revenue Targets Timeline */}
          {revenueData.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Revenue Projection
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.2} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Cost Structure & Breakeven */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
          {/* Cost Structure */}
          {costs && (
            <>
              {costs.cogs_per_unit !== undefined && costs.cogs_per_unit !== null && (
                <div className="p-4 bg-secondary rounded-lg text-center">
                  <p className="text-2xl font-bold text-foreground">${Number(costs.cogs_per_unit).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">COGS per Unit</p>
                </div>
              )}
              {costs.amazon_fees_percent !== undefined && costs.amazon_fees_percent !== null && (
                <div className="p-4 bg-secondary rounded-lg text-center">
                  <p className="text-2xl font-bold text-foreground">{Number(costs.amazon_fees_percent)}%</p>
                  <p className="text-xs text-muted-foreground">Amazon Fees</p>
                </div>
              )}
            </>
          )}
          
          {/* Breakeven */}
          {breakeven && (
            <>
              {breakeven.months_to_breakeven !== undefined && (
                <div className="p-4 bg-chart-4/10 border border-chart-4/20 rounded-lg text-center">
                  <p className="text-2xl font-bold text-chart-4">{breakeven.months_to_breakeven}</p>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Months to Breakeven
                  </p>
                </div>
              )}
              {breakeven.units_to_breakeven !== undefined && (
                <div className="p-4 bg-secondary rounded-lg text-center">
                  <p className="text-2xl font-bold text-foreground">{breakeven.units_to_breakeven.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Units to Breakeven</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Margin Projections */}
        {margins && (margins.year_1 !== undefined || margins.year_2 !== undefined) && (
          <div className="mt-8 space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Margin Projections
            </h4>
            <div className="grid md:grid-cols-2 gap-6">
              {margins.year_1 !== undefined && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Year 1 Margin</span>
                    <span className="text-sm font-bold">{margins.year_1}%</span>
                  </div>
                  <Progress value={margins.year_1} className="h-2" />
                </div>
              )}
              {margins.year_2 !== undefined && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Year 2 Margin</span>
                    <span className="text-sm font-bold">{margins.year_2}%</span>
                  </div>
                  <Progress value={margins.year_2} className="h-2" />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
