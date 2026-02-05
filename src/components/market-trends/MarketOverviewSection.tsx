import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, TrendingUp, DollarSign, BarChart3, Zap } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { StatCard } from "@/components/ui/stat-card";
import { Progress } from "@/components/ui/progress";

interface MarketOverviewData {
  globalMarketSize: string;
  usMarketSize: string;
  growthDrivers: string[];
  amazonContext: string;
}

interface MarketOverviewSectionProps {
  data: MarketOverviewData;
}

// Helper to extract numeric value from market size string (e.g., "$15.2 billion" -> 15.2)
function extractNumericValue(str: string): number {
  const match = str.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

// Helper to get the suffix (billion, million, etc.)
function extractSuffix(str: string): string {
  if (str.toLowerCase().includes("billion")) return "B";
  if (str.toLowerCase().includes("million")) return "M";
  if (str.toLowerCase().includes("trillion")) return "T";
  return "";
}

const driverIcons = [Zap, TrendingUp, Globe, DollarSign, BarChart3];

export function MarketOverviewSection({ data }: MarketOverviewSectionProps) {
  const globalValue = extractNumericValue(data.globalMarketSize);
  const usValue = extractNumericValue(data.usMarketSize);
  const globalSuffix = extractSuffix(data.globalMarketSize);
  const usSuffix = extractSuffix(data.usMarketSize);
  
  // Calculate US as percentage of global for the progress bar
  const usPercentage = globalValue > 0 ? Math.min((usValue / globalValue) * 100, 100) : 30;

  return (
    <div className="space-y-6">
      {/* Market Size Stats with Animated Numbers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Global Market Size"
          value={
            <AnimatedNumber
              value={globalValue}
              decimals={1}
              prefix="$"
              suffix={globalSuffix}
            />
          }
          icon={<Globe className="h-5 w-5" />}
          variant="primary"
          subtitle="Total addressable market"
        />
        <StatCard
          title="U.S. Market Size"
          value={
            <AnimatedNumber
              value={usValue}
              decimals={1}
              prefix="$"
              suffix={usSuffix}
            />
          }
          icon={<DollarSign className="h-5 w-5" />}
          variant="success"
          subtitle="Domestic opportunity"
        />
      </div>

      {/* Market Size Comparison */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">U.S. Market Share</CardTitle>
          </div>
          <CardDescription>U.S. portion of the global market</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">U.S. vs Global</span>
            <span className="font-medium">{usPercentage.toFixed(0)}%</span>
          </div>
          <Progress value={usPercentage} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>$0</span>
            <span>{data.globalMarketSize}</span>
          </div>
        </CardContent>
      </Card>

      {/* Growth Drivers with Visual Icons */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-chart-4" />
            <CardTitle className="text-lg">Key Growth Drivers</CardTitle>
          </div>
          <CardDescription>Factors driving market expansion</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.growthDrivers.map((driver, index) => {
              const IconComponent = driverIcons[index % driverIcons.length];
              return (
                <div
                  key={index}
                  className="group flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-primary/30 hover:bg-secondary/50 transition-all duration-200 cursor-default"
                >
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <IconComponent className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm text-foreground font-medium">{driver}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Amazon Context - Enhanced Visual */}
      <Card className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-chart-1/5 via-transparent to-chart-2/5 pointer-events-none" />
        <CardHeader className="relative">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-chart-1/10">
              <BarChart3 className="h-5 w-5 text-chart-1" />
            </div>
            <div>
              <CardTitle className="text-lg">Amazon Marketplace Insights</CardTitle>
              <CardDescription>Platform-specific performance and trends</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="p-4 rounded-lg bg-background/80 backdrop-blur-sm border border-border/50">
            <p className="text-foreground leading-relaxed">{data.amazonContext}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
