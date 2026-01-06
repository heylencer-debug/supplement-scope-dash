import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useBulkSupplementAnalysis } from "@/hooks/useBulkSupplementAnalysis";

interface Product {
  id: string;
  asin: string;
  title: string | null;
  brand: string | null;
  main_image_url: string | null;
  ocr_confidence: string | null;
  nutrients_count: number | null;
}

interface LowConfidenceProductsProps {
  products: Product[] | undefined;
  categoryId: string | undefined;
  isLoading: boolean;
}

export function LowConfidenceProducts({ products, categoryId, isLoading }: LowConfidenceProductsProps) {
  const { startBulkAnalysis, isAnalyzing, progress, resetProgress } = useBulkSupplementAnalysis(categoryId);

  const lowConfidenceProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.ocr_confidence === "low");
  }, [products]);

  const handleBulkReanalysis = async () => {
    if (!categoryId) return;
    await startBulkAnalysis(categoryId);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Low Confidence Extractions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (lowConfidenceProducts.length === 0) {
    return null; // Don't show section if no low confidence products
  }

  const progressPercentage = progress.total > 0 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;

  return (
    <Card className="border-warning/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Low Confidence Extractions
            </CardTitle>
            <CardDescription>
              {lowConfidenceProducts.length} products need re-analysis for accurate supplement facts
            </CardDescription>
          </div>
          <Button
            onClick={handleBulkReanalysis}
            disabled={isAnalyzing || !categoryId}
            variant="default"
            size="sm"
            className="gap-2"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Bulk Reanalysis
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Section */}
        {progress.status === "running" && (
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                <span className="text-sm font-medium text-foreground">
                  Reanalyzing products...
                </span>
              </div>
              <Badge variant="outline">
                {progress.completed} / {progress.total}
              </Badge>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            {progress.currentProduct && (
              <p className="text-xs text-muted-foreground truncate">
                Current: {progress.currentProduct}
              </p>
            )}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-chart-4" />
                {progress.success} success
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3 text-destructive" />
                {progress.failed} failed
              </span>
            </div>
          </div>
        )}

        {/* Completion Message */}
        {progress.status === "complete" && (
          <div className="p-4 bg-chart-4/10 rounded-lg border border-chart-4/30 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-chart-4" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Reanalysis Complete
              </p>
              <p className="text-xs text-muted-foreground">
                {progress.success} products updated successfully
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {progress.status === "error" && (
          <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Analysis Error
              </p>
              <p className="text-xs text-muted-foreground">
                {progress.error || "An error occurred during analysis"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={resetProgress}>
              Dismiss
            </Button>
          </div>
        )}

        {/* Products List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {lowConfidenceProducts.slice(0, 8).map((product) => (
            <div
              key={product.id}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border"
            >
              {product.main_image_url ? (
                <img
                  src={product.main_image_url}
                  alt={product.title || "Product"}
                  className="w-12 h-12 object-contain rounded bg-background"
                />
              ) : (
                <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {product.brand || "Unknown Brand"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {product.title?.substring(0, 40) || product.asin}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="destructive" className="text-[9px] h-4 px-1.5">
                    Low Confidence
                  </Badge>
                  <span className="text-[9px] text-muted-foreground">
                    {product.nutrients_count || 0} nutrients
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {lowConfidenceProducts.length > 8 && (
          <p className="text-xs text-muted-foreground text-center">
            +{lowConfidenceProducts.length - 8} more products with low confidence
          </p>
        )}
      </CardContent>
    </Card>
  );
}
