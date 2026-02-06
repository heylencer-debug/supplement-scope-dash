import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, ComposedChart, Area,
} from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";

interface HistoricalData {
  monthly_bsr_history?: Record<string, number | null>;
  monthly_sales_history?: Record<string, number | null>;
}

interface Props {
  historicalData: HistoricalData | null;
}

function parseMonthlyData(history: Record<string, number | null> | undefined) {
  if (!history) return [];
  const entries: { month: number; label: string; value: number }[] = [];
  for (let m = 24; m >= 1; m--) {
    const val = history[`month_${m}`];
    if (val != null) {
      entries.push({
        month: m,
        label: m === 1 ? "Now" : `${m}mo ago`,
        value: val,
      });
    }
  }
  return entries;
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

export default function HistoricalBSRSalesChart({ historicalData }: Props) {
  if (!historicalData) return null;

  const bsrData = parseMonthlyData(historicalData.monthly_bsr_history);
  const salesData = parseMonthlyData(historicalData.monthly_sales_history);

  if (bsrData.length === 0 && salesData.length === 0) return null;

  // Merge for combined view
  const combinedData = bsrData.map((b) => {
    const s = salesData.find((s) => s.month === b.month);
    return { ...b, bsr: b.value, sales: s?.value ?? null };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Historical BSR & Sales (up to 24 months)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="bsr" className="space-y-3">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="bsr" className="text-xs">BSR History</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">Sales History</TabsTrigger>
            <TabsTrigger value="combined" className="text-xs">Combined</TabsTrigger>
          </TabsList>

          {/* BSR History */}
          <TabsContent value="bsr">
            {bsrData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={bsrData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    reversed
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: number) => [`#${value.toLocaleString()}`, "BSR"]}
                    contentStyle={tooltipStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No BSR history available</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Lower BSR = better ranking</p>
          </TabsContent>

          {/* Sales History */}
          <TabsContent value="sales">
            {salesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString(), "Est. Sales"]}
                    contentStyle={tooltipStyle}
                  />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--chart-2))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No sales history available</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Estimated from calibrated BSR power-law model</p>
          </TabsContent>

          {/* Combined */}
          <TabsContent value="combined">
            {combinedData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={combinedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="bsr"
                    orientation="left"
                    reversed
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                    width={50}
                    label={{ value: "BSR", angle: -90, position: "insideLeft", style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 } }}
                  />
                  <YAxis
                    yAxisId="sales"
                    orientation="right"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                    width={50}
                    label={{ value: "Sales", angle: 90, position: "insideRight", style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 } }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "bsr") return [`#${value.toLocaleString()}`, "BSR"];
                      return [value.toLocaleString(), "Est. Sales"];
                    }}
                    contentStyle={tooltipStyle}
                  />
                  <Area
                    yAxisId="sales"
                    type="monotone"
                    dataKey="sales"
                    fill="hsl(var(--chart-2) / 0.2)"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={1.5}
                  />
                  <Line
                    yAxisId="bsr"
                    type="monotone"
                    dataKey="bsr"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No historical data available</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">BSR (line, left axis - lower is better) vs Est. Sales (area, right axis)</p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
