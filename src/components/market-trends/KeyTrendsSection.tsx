import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Sparkles, BarChart, Flame, Zap, Star } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { TrendHeatIndicator } from "./TrendHeatIndicator";
import { ScrollAnimate } from "@/components/ui/scroll-animate";

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

const trendIcons = [Flame, Zap, Star, TrendingUp, Sparkles];

export function KeyTrendsSection({ data }: KeyTrendsSectionProps) {
  // Create chart data based on trend order (higher = more important)
  const chartData = data.trends.map((trend, index) => ({
    name: trend.trendName.length > 20 ? trend.trendName.substring(0, 20) + '...' : trend.trendName,
    importance: data.trends.length - index,
    fullName: trend.trendName,
  }));

  // Radar chart data - normalize to percentage
  const radarData = data.trends.slice(0, 5).map((trend, index) => ({
    subject: trend.trendName.length > 12 ? trend.trendName.substring(0, 12) + '...' : trend.trendName,
    value: ((data.trends.length - index) / data.trends.length) * 100,
    fullMark: 100,
  }));

  // Assign heat levels based on position
  const getHeatLevel = (index: number): "hot" | "warm" | "cool" => {
    if (index === 0) return "hot";
    if (index < 3) return "warm";
    return "cool";
  };

  return (
    <div className="space-y-6">
      {/* Trend Visualization Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <ScrollAnimate variant="scale-up">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-chart-4" />
                <CardTitle className="text-lg">Trend Radar</CardTitle>
              </div>
              <CardDescription>Visual comparison of trend strength</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Radar
                      name="Trend Strength"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </ScrollAnimate>

        {/* Bar Chart */}
        <ScrollAnimate variant="scale-up" delay={100}>
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
        </ScrollAnimate>
      </div>

      {/* Trend Cards with Visual Enhancements */}
      <ScrollAnimate variant="fade-up" delay={200}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-chart-2" />
              <CardTitle className="text-lg">Market Trends</CardTitle>
            </div>
            <CardDescription>Current and emerging trends in this category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.trends.map((trend, index) => {
                const IconComponent = trendIcons[index % trendIcons.length];
                const heatLevel = getHeatLevel(index);
                
                return (
                  <div
                    key={index}
                    className="group relative p-4 rounded-xl bg-gradient-to-r from-secondary/30 to-secondary/10 border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-300"
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftColor: COLORS[index % COLORS.length],
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                          style={{ backgroundColor: `${COLORS[index % COLORS.length]}20` }}
                        >
                          <IconComponent
                            className="h-5 w-5"
                            style={{ color: COLORS[index % COLORS.length] }}
                          />
                        </div>
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-foreground">{trend.trendName}</h4>
                            <TrendHeatIndicator level={heatLevel} size="sm" />
                          </div>
                          <p className="text-muted-foreground text-sm leading-relaxed">{trend.description}</p>
                        </div>
                      </div>
                      {trend.statistics && (
                        <div className="shrink-0 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                          <span className="text-sm font-semibold text-primary">{trend.statistics}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </ScrollAnimate>
    </div>
  );
}
