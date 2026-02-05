import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, TrendingDown, Building2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

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

  return (
    <div className="space-y-6">
      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Brand Revenue on Amazon</CardTitle>
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
                      const data = payload[0].payload as any;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium">{data.fullName}</p>
                          <p className="text-sm text-muted-foreground">
                            Revenue: ${data.revenue}M
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

      {/* Brand Rankings List */}
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
                className="p-4 rounded-lg bg-secondary/30 border border-border/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className="w-8 h-8 p-0 flex items-center justify-center text-sm font-bold"
                    >
                      {index + 1}
                    </Badge>
                    <div>
                      <h4 className="font-semibold text-foreground">{brand.brandName}</h4>
                      <p className="text-sm text-muted-foreground">{brand.strengths}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-lg">${brand.amazonRevenue}M</p>
                    <div className="flex items-center gap-1 justify-end">
                      {brand.yoyChange >= 0 ? (
                        <>
                          <TrendingUp className="h-4 w-4 text-chart-4" />
                          <span className="text-sm text-chart-4">+{brand.yoyChange}%</span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-4 w-4 text-destructive" />
                          <span className="text-sm text-destructive">{brand.yoyChange}%</span>
                        </>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Market Share Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{data.marketShareInsights}</p>
        </CardContent>
      </Card>
    </div>
  );
}
