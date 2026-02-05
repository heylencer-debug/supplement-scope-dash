import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, Globe, Lightbulb, Target, AlertCircle, TrendingUp, ArrowUpRight, MapPin } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, Area, AreaChart } from "recharts";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { StatCard } from "@/components/ui/stat-card";

interface FutureOutlookData {
  projectedCagr: string;
  timeframe: string;
  growthRegions: string[];
  innovations: string;
  opportunities: string;
  externalFactors: string;
}

interface FutureOutlookSectionProps {
  data: FutureOutlookData;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

// Extract numeric CAGR value
function extractCagrValue(str: string): number {
  const match = str.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 8;
}

export function FutureOutlookSection({ data }: FutureOutlookSectionProps) {
  const cagrValue = extractCagrValue(data.projectedCagr);
  
  // Create growth trajectory data
  const years = 5;
  const trajectoryData = Array.from({ length: years + 1 }, (_, i) => ({
    year: `Year ${i}`,
    value: Math.round(100 * Math.pow(1 + cagrValue / 100, i)),
  }));

  // Create pie chart data from growth regions
  const pieData = data.growthRegions.map((region, index) => ({
    name: region,
    value: Math.max(30 - index * 5, 10),
    color: COLORS[index % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Growth Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Projected CAGR"
          value={
            <div className="flex items-baseline gap-1">
              <AnimatedNumber value={cagrValue} decimals={1} />
              <span className="text-lg">%</span>
            </div>
          }
          icon={<TrendingUp className="h-5 w-5" />}
          variant="primary"
          trend="Compound Annual Growth"
          trendDirection="up"
        />
        <StatCard
          title="Timeframe"
          value={data.timeframe}
          icon={<Rocket className="h-5 w-5" />}
          variant="success"
          subtitle="Forecast period"
        />
        <StatCard
          title="Growth Regions"
          value={data.growthRegions.length}
          icon={<Globe className="h-5 w-5" />}
          variant="warning"
          subtitle="Key markets identified"
        />
      </div>

      {/* Growth Trajectory Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-chart-4" />
            <CardTitle className="text-lg">Growth Trajectory</CardTitle>
          </div>
          <CardDescription>Projected market growth over {years} years at {data.projectedCagr} CAGR</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trajectoryData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  content={({ payload, label }) => {
                    if (payload && payload[0]) {
                      return (
                        <div className="bg-popover border rounded-lg p-2 shadow-lg">
                          <p className="font-medium">{label}</p>
                          <p className="text-chart-4 font-bold">{payload[0].value}% of base</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--chart-4))"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorGrowth)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Regional Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-chart-2" />
              <CardTitle className="text-lg">Regional Distribution</CardTitle>
            </div>
            <CardDescription>Geographic expansion opportunities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ payload }) => {
                      if (payload && payload[0]) {
                        return (
                          <div className="bg-popover border rounded-lg p-2 shadow-lg">
                            <p className="font-medium">{(payload[0].payload as any).name}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-chart-1" />
              <CardTitle className="text-lg">Key Growth Regions</CardTitle>
            </div>
            <CardDescription>Markets with highest potential</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.growthRegions.map((region, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-primary/30 transition-colors"
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor: COLORS[index % COLORS.length],
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      backgroundColor: `${COLORS[index % COLORS.length]}20`,
                      color: COLORS[index % COLORS.length],
                    }}
                  >
                    {index + 1}
                  </div>
                  <span className="font-medium text-foreground">{region}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Innovations */}
      <Card className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-chart-4/5 via-transparent to-chart-2/5 pointer-events-none" />
        <CardHeader className="relative">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-chart-4/10">
              <Lightbulb className="h-5 w-5 text-chart-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Emerging Innovations</CardTitle>
              <CardDescription>New products, formulations, and packaging trends</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="p-4 rounded-lg bg-background/80 backdrop-blur-sm border border-chart-4/20">
            <p className="text-foreground leading-relaxed">{data.innovations}</p>
          </div>
        </CardContent>
      </Card>

      {/* Opportunities */}
      <Card className="overflow-hidden border-chart-4/30">
        <div className="absolute inset-0 bg-gradient-to-br from-chart-4/10 to-chart-4/5 pointer-events-none" />
        <CardHeader className="relative">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-chart-4/20">
              <Target className="h-5 w-5 text-chart-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Strategic Opportunities</CardTitle>
              <CardDescription>Key opportunities for sellers and brands</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="p-4 rounded-lg bg-background/80 backdrop-blur-sm border border-chart-4/30">
            <p className="text-foreground leading-relaxed font-medium">{data.opportunities}</p>
          </div>
        </CardContent>
      </Card>

      {/* External Factors */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-chart-2" />
            <CardTitle className="text-lg">External Factors</CardTitle>
          </div>
          <CardDescription>Regulations, trends, and market influences</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-chart-2/5 border border-chart-2/20">
            <p className="text-foreground leading-relaxed">{data.externalFactors}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
