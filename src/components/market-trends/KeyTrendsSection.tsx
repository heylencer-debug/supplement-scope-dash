import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Sparkles, BarChart } from "lucide-react";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Trend {
  trendName: string;
  description: string;
  statistics?: string;
}

interface KeyTrendsData {
  trends: Trend[];
}

interface KeyTrendsSectionProps {
  data: KeyTrendsData;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function KeyTrendsSection({ data }: KeyTrendsSectionProps) {
  // Create chart data based on trend order (higher = more important)
  const chartData = data.trends.map((trend, index) => ({
    name: trend.trendName.length > 20 ? trend.trendName.substring(0, 20) + '...' : trend.trendName,
    importance: data.trends.length - index,
    fullName: trend.trendName,
  }));

  return (
    <div className="space-y-6">
      {/* Trend Popularity Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Trend Importance</CardTitle>
          </div>
          <CardDescription>Ranked by market impact and relevance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                <Tooltip
                  content={({ payload }) => {
                    if (payload && payload[0]) {
                      return (
                        <div className="bg-popover border rounded-lg p-2 shadow-lg">
                          <p className="font-medium">{(payload[0].payload as any).fullName}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Trend Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-chart-4" />
            <CardTitle className="text-lg">Market Trends</CardTitle>
          </div>
          <CardDescription>Current and emerging trends in this category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.trends.map((trend, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-secondary/30 border border-border/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-foreground">{trend.trendName}</h4>
                    </div>
                    <p className="text-muted-foreground text-sm">{trend.description}</p>
                  </div>
                  {trend.statistics && (
                    <Badge variant="outline" className="shrink-0">
                      {trend.statistics}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
