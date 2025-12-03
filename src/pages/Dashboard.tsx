import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, DollarSign, Star, Package } from "lucide-react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const opportunityScore = 78;

const sentimentData = [
  { name: "Positive", value: 65, fill: "hsl(var(--chart-3))" },
  { name: "Neutral", value: 25, fill: "hsl(var(--chart-4))" },
  { name: "Negative", value: 10, fill: "hsl(var(--chart-5))" },
];

const criteriaData = [
  { criteria: "Quality", score: 85 },
  { criteria: "Price", score: 72 },
  { criteria: "Reviews", score: 90 },
  { criteria: "Demand", score: 78 },
  { criteria: "Competition", score: 65 },
  { criteria: "Margin", score: 82 },
  { criteria: "Trend", score: 88 },
  { criteria: "Supply", score: 70 },
];

const revenueData = [
  { month: "Jan", revenue: 45000, price: 24.99 },
  { month: "Feb", revenue: 52000, price: 25.99 },
  { month: "Mar", revenue: 48000, price: 25.49 },
  { month: "Apr", revenue: 61000, price: 26.99 },
  { month: "May", revenue: 55000, price: 26.49 },
  { month: "Jun", revenue: 67000, price: 27.99 },
];

const kpiData = [
  { label: "Total Products", value: "2,847", icon: Package, trend: "+12%", up: true },
  { label: "Avg. Opportunity", value: "72.4", icon: Target, trend: "+5.2%", up: true },
  { label: "Market Revenue", value: "$2.4M", icon: DollarSign, trend: "+18%", up: true },
  { label: "Avg. Rating", value: "4.3", icon: Star, trend: "-0.2", up: false },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Market analysis results and insights</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, idx) => (
          <Card key={idx}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <kpi.icon className="h-6 w-6 text-accent" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {kpi.up ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className={kpi.up ? "text-green-500 text-sm" : "text-red-500 text-sm"}>
                  {kpi.trend}
                </span>
                <span className="text-muted-foreground text-sm">vs last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Opportunity Score Gauge */}
        <Card>
          <CardHeader>
            <CardTitle>Opportunity Score</CardTitle>
            <CardDescription>Overall market opportunity rating (0-100)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative w-48 h-48">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="hsl(var(--secondary))"
                    strokeWidth="12"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="hsl(var(--accent))"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${opportunityScore * 2.51} 251`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-foreground">{opportunityScore}</span>
                  <span className="text-sm text-muted-foreground">out of 100</span>
                </div>
              </div>
              <Badge className="mt-4 bg-accent/10 text-accent">High Opportunity</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Sentiment Analysis</CardTitle>
            <CardDescription>Customer review sentiment breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-2">
              {sentimentData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {item.name}: {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Criteria Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>18-Criteria Breakdown</CardTitle>
            <CardDescription>Performance across key analysis criteria</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={criteriaData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="criteria" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="hsl(var(--accent))"
                  fill="hsl(var(--accent))"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Market Revenue & Pricing</CardTitle>
            <CardDescription>6-month revenue and pricing trends</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--accent))" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="price"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--chart-2))" }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-accent" />
                <span className="text-sm text-muted-foreground">Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} />
                <span className="text-sm text-muted-foreground">Avg. Price</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
