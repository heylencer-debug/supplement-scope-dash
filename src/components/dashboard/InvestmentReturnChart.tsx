import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface InvestmentBreakdown {
  product_development?: number;
  inventory?: number;
  marketing?: number;
  packaging?: number;
  content?: number;
  testing?: number;
}

interface RevenueTargets {
  month_1?: number;
  month_3?: number;
  month_6?: number;
  month_12?: number;
  month_24?: number;
}

interface InvestmentReturnChartProps {
  investmentBreakdown: InvestmentBreakdown | null;
  revenueTargets: RevenueTargets | null;
  totalInvestment: number | null;
  isLoading?: boolean;
}

export function InvestmentReturnChart({
  investmentBreakdown,
  revenueTargets,
  totalInvestment,
  isLoading = false,
}: InvestmentReturnChartProps) {
  // Prepare investment bar data
  const investmentData = investmentBreakdown
    ? Object.entries(investmentBreakdown)
        .filter(([_, value]) => value && value > 0)
        .map(([key, value]) => ({
          name: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          value: value || 0,
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  // Prepare revenue projection data
  const revenueData = revenueTargets
    ? [
        { month: "M1", revenue: revenueTargets.month_1 || 0 },
        { month: "M3", revenue: revenueTargets.month_3 || 0 },
        { month: "M6", revenue: revenueTargets.month_6 || 0 },
        { month: "M12", revenue: revenueTargets.month_12 || 0 },
        { month: "M24", revenue: revenueTargets.month_24 || 0 },
      ].filter((d) => d.revenue > 0)
    : [];

  // Combined data for composed chart
  const chartData = revenueData.map((rd, idx) => ({
    ...rd,
    investment: idx === 0 ? totalInvestment || 0 : 0,
  }));

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  if (!investmentBreakdown && !revenueTargets) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-[#1e3a5f]">
          Investment vs. Return
        </CardTitle>
        <CardDescription>
          {totalInvestment
            ? `Total Investment: ${formatCurrency(totalInvestment)}`
            : "Startup costs and revenue projection"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[250px] w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Investment Breakdown */}
            {investmentData.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                  Startup Investment Breakdown
                </p>
                <div className="space-y-2">
                  {investmentData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-28 truncate">
                        {item.name}
                      </span>
                      <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0ea5e9] rounded-full transition-all"
                          style={{
                            width: `${(item.value / (totalInvestment || 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium w-16 text-right">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revenue Projection Chart */}
            {chartData.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                  Revenue Projection
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    />
                    <YAxis
                      tickFormatter={(value) => formatCurrency(value)}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === "revenue" ? "Revenue" : "Investment",
                      ]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="investment"
                      name="Investment"
                      fill="#1e3a5f"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#0ea5e9"
                      strokeWidth={3}
                      dot={{ fill: "#0ea5e9", r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
