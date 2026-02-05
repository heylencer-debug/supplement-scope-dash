import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, TrendingDown, Building2, PieChart as PieChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { AnimatedNumber } from "@/components/ui/animated-number";

interface BrandRanking {
  brandName: string;
  amazonRevenue: number;
  yoyChange: number;
  strengths: string;
}

interface CompetitiveLandscapeData {
  brandRankings: BrandRanking[];
  marketShareInsights: string;
}

interface CompetitiveLandscapeSectionProps {
  data: CompetitiveLandscapeData;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function CompetitiveLandscapeSection({ data }: CompetitiveLandscapeSectionProps) {
  const chartData = data.brandRankings.map(brand => ({
    name: brand.brandName.length > 15 ? brand.brandName.substring(0, 15) + '...' : brand.brandName,
    revenue: brand.amazonRevenue,
    fullName: brand.brandName,
  }));

  // Donut chart data for market share visualization
  const totalRevenue = data.brandRankings.reduce((sum, b) => sum + b.amazonRevenue, 0);
  const pieData = data.brandRankings.slice(0, 5).map((brand, index) => ({
    name: brand.brandName,
    value: brand.amazonRevenue,
    percentage: ((brand.amazonRevenue / totalRevenue) * 100).toFixed(1),
    color: COLORS[index % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Brands</p>
          <p className="text-2xl font-bold text-foreground">{data.brandRankings.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Combined Revenue</p>
          <p className="text-2xl font-bold text-foreground">
            <AnimatedNumber value={totalRevenue} decimals={0} prefix="$" suffix="M" />
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg Growth</p>
          <p className="text-2xl font-bold text-chart-4">
            +{(data.brandRankings.reduce((sum, b) => sum + b.yoyChange, 0) / data.brandRankings.length).toFixed(1)}%
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Market Leader</p>
          <p className="text-lg font-bold text-foreground truncate">{data.brandRankings[0]?.brandName}</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Share Donut */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-chart-4" />
              <CardTitle className="text-lg">Market Share</CardTitle>
            </div>
            <CardDescription>Revenue distribution among top brands</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ percentage }) => `${percentage}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ payload }) => {
                      if (payload && payload[0]) {
                        const d = payload[0].payload as any;
                        return (
                          <div className="bg-popover border rounded-lg p-2 shadow-lg">
                            <p className="font-medium">{d.name}</p>
                            <p className="text-sm text-muted-foreground">
                              ${d.value}M ({d.percentage}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Bar Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Brand Revenue</CardTitle>
            </div>
            <CardDescription>Estimated annual revenue in millions USD</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 20, right: 20, bottom: 40 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${value}M`} />
                  <Tooltip
                    content={({ payload }) => {
                      if (payload && payload[0]) {
                        const d = payload[0].payload as any;
                        return (
                          <div className="bg-popover border rounded-lg p-3 shadow-lg">
                            <p className="font-medium">{d.fullName}</p>
                            <p className="text-sm text-muted-foreground">
                              Revenue: ${d.revenue}M
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Brand Rankings List with Visual Enhancements */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-chart-2" />
            <CardTitle className="text-lg">Brand Performance</CardTitle>
          </div>
          <CardDescription>Year-over-year changes and competitive strengths</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.brandRankings.map((brand, index) => (
              <div
                key={index}
                className="group relative p-4 rounded-xl bg-gradient-to-r from-secondary/30 to-secondary/10 border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-300"
                style={{
                  borderLeftWidth: '4px',
                  borderLeftColor: COLORS[index % COLORS.length],
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                      style={{
                        backgroundColor: `${COLORS[index % COLORS.length]}20`,
                        color: COLORS[index % COLORS.length],
                      }}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{brand.brandName}</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">{brand.strengths}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-xl">
                      <AnimatedNumber value={brand.amazonRevenue} decimals={0} prefix="$" suffix="M" duration={800} />
                    </p>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      {brand.yoyChange >= 0 ? (
                        <Badge variant="outline" className="bg-chart-4/10 text-chart-4 border-chart-4/30">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          +{brand.yoyChange}%
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          {brand.yoyChange}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Market Share Insights */}
      <Card className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-chart-2/5 via-transparent to-chart-1/5 pointer-events-none" />
        <CardHeader className="relative">
          <CardTitle className="text-lg">Market Share Analysis</CardTitle>
          <CardDescription>Strategic insights and competitive dynamics</CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="p-4 rounded-lg bg-background/80 backdrop-blur-sm border border-border/50">
            <p className="text-foreground leading-relaxed">{data.marketShareInsights}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
