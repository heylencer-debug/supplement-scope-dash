import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, TrendingUp, DollarSign, BarChart3 } from "lucide-react";

interface MarketOverviewData {
  globalMarketSize: string;
  usMarketSize: string;
  growthDrivers: string[];
  amazonContext: string;
}

interface MarketOverviewSectionProps {
  data: MarketOverviewData;
}

export function MarketOverviewSection({ data }: MarketOverviewSectionProps) {
  return (
    <div className="space-y-6">
      {/* Market Size Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Global Market</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{data.globalMarketSize}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-chart-2/5 to-chart-2/10 border-chart-2/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-chart-2" />
              <CardTitle className="text-lg">U.S. Market</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{data.usMarketSize}</p>
          </CardContent>
        </Card>
      </div>

      {/* Growth Drivers */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-chart-4" />
            <CardTitle className="text-lg">Key Growth Drivers</CardTitle>
          </div>
          <CardDescription>Factors driving market expansion</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.growthDrivers.map((driver, index) => (
              <Badge key={index} variant="secondary" className="text-sm py-1.5 px-3">
                {driver}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Amazon Context */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-chart-1" />
            <CardTitle className="text-lg">Amazon Marketplace Insights</CardTitle>
          </div>
          <CardDescription>Platform-specific performance and trends</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{data.amazonContext}</p>
        </CardContent>
      </Card>
    </div>
  );
}
