import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, CheckCircle2, Award, Tag } from "lucide-react";

interface PackagingData {
  type?: string;
  quantity?: string | number;
  design_elements?: string[];
}

interface PackagingIntelligenceProps {
  packagingData: PackagingData | null;
  productsClaims: (string | null | undefined)[];
  isLoading?: boolean;
}

export function PackagingIntelligence({ packagingData, productsClaims, isLoading }: PackagingIntelligenceProps) {
  // Aggregate claims and calculate frequency
  const topClaims = useMemo(() => {
    const claimFrequency = new Map<string, number>();
    
    productsClaims.forEach(claimsString => {
      if (!claimsString) return;
      
      // Parse claims - they might be comma-separated or already individual
      const claims = claimsString.split(/[,;]/).map(c => c.trim()).filter(Boolean);
      
      claims.forEach(claim => {
        // Normalize claim text
        const normalizedClaim = claim.toLowerCase().trim();
        if (normalizedClaim.length > 2) {
          // Use original casing for display but count normalized versions
          const existingKey = Array.from(claimFrequency.keys()).find(
            k => k.toLowerCase() === normalizedClaim
          );
          if (existingKey) {
            claimFrequency.set(existingKey, (claimFrequency.get(existingKey) || 0) + 1);
          } else {
            claimFrequency.set(claim.trim(), 1);
          }
        }
      });
    });

    // Sort by frequency and take top 10
    return Array.from(claimFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([claim, count]) => ({ claim, count }));
  }, [productsClaims]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Package className="w-5 h-5 text-primary" />
            Winning Packaging Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = packagingData || topClaims.length > 0;

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Package className="w-5 h-5 text-primary" />
            Winning Packaging Strategy
          </CardTitle>
          <CardDescription>Packaging intelligence not yet available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Packaging analysis will appear here once the analysis is complete.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Package className="w-5 h-5 text-primary" />
          Winning Packaging Strategy
        </CardTitle>
        <CardDescription>Recommended packaging format and key claims from market analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Recommended Format */}
        {packagingData && (packagingData.type || packagingData.quantity) && (
          <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Recommended Format</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">
                {packagingData.type || "N/A"}
              </span>
              {packagingData.quantity && (
                <span className="text-sm text-muted-foreground">
                  ({packagingData.quantity} count)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Key Design Elements */}
        {packagingData?.design_elements && packagingData.design_elements.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-chart-4" />
              Key Design Elements
            </h4>
            <ul className="space-y-2">
              {packagingData.design_elements.map((element, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-chart-4 mt-2 shrink-0" />
                  <span className="text-foreground">{element}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top Claims */}
        {topClaims.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-chart-2" />
              Top Claims in Category
            </h4>
            <div className="flex flex-wrap gap-2">
              {topClaims.map(({ claim, count }, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="text-xs py-1 px-2"
                >
                  {claim}
                  <span className="ml-1.5 text-muted-foreground">({count})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
