import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, Globe, Lightbulb, Target, AlertCircle, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

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

export function FutureOutlookSection({ data }: FutureOutlookSectionProps) {
  // Create pie chart data from growth regions
  const pieData = data.growthRegions.map((region, index) => ({
    name: region,
    value: Math.max(30 - index * 5, 10), // Decreasing values for visualization
  }));

  return (
    <div className="space-y-6">
      {/* Growth Projection Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Growth Projection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-foreground">{data.projectedCagr}</span>
            <span className="text-muted-foreground">CAGR</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Timeframe: {data.timeframe}</p>
        </CardContent>
      </Card>

      {/* Regional Growth Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-chart-2" />
            <CardTitle className="text-lg">Key Growth Regions</CardTitle>
          </div>
          <CardDescription>Geographic expansion opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
            <div className="flex flex-wrap gap-2">
              {data.growthRegions.map((region, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  style={{ borderColor: COLORS[index % COLORS.length], color: COLORS[index % COLORS.length] }}
                  className="py-1.5 px-3"
                >
                  {region}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Innovations */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-chart-4" />
            <CardTitle className="text-lg">Emerging Innovations</CardTitle>
          </div>
          <CardDescription>New products, formulations, and packaging trends</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{data.innovations}</p>
        </CardContent>
      </Card>

      {/* Opportunities */}
      <Card className="bg-gradient-to-br from-chart-4/5 to-chart-4/10 border-chart-4/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-chart-4" />
            <CardTitle className="text-lg">Strategic Opportunities</CardTitle>
          </div>
          <CardDescription>Key opportunities for sellers and brands</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-foreground leading-relaxed">{data.opportunities}</p>
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
          <p className="text-muted-foreground leading-relaxed">{data.externalFactors}</p>
        </CardContent>
      </Card>
    </div>
  );
}
