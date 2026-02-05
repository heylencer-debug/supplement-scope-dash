import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useMarketTrendAnalysis } from "@/hooks/useMarketTrendAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RefreshCw, TrendingUp, Package, Users, Target, Rocket, Globe, MessageCircle } from "lucide-react";
import { format } from "date-fns";

import { MarketOverviewSection } from "@/components/market-trends/MarketOverviewSection";
import { KeyTrendsSection } from "@/components/market-trends/KeyTrendsSection";
import { TopProductsSection } from "@/components/market-trends/TopProductsSection";
import { CompetitiveLandscapeSection } from "@/components/market-trends/CompetitiveLandscapeSection";
import { ConsumerInsightsSection } from "@/components/market-trends/ConsumerInsightsSection";
import { FutureOutlookSection } from "@/components/market-trends/FutureOutlookSection";
import { MarketTrendsChat } from "@/components/market-trends/MarketTrendsChat";
import { FloatingChatButton } from "@/components/ui/floating-chat-button";

export default function MarketTrend() {
  const [searchParams] = useSearchParams();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { categoryName: contextCategoryName } = useCategoryContext();
  const urlCategoryName = searchParams.get("category");
  const activeCategoryName = urlCategoryName || contextCategoryName;

  const { data: category, isLoading: categoryLoading } = useCategoryByName(activeCategoryName);
  const {
    analysis,
    isLoading,
    isLoadingFromDb,
    error,
    pollingStatus,
    refreshAnalysis,
    hasAnalysis,
    isProcessing,
  } = useMarketTrendAnalysis(category?.id);

  const handleRefresh = () => {
    if (activeCategoryName) {
      refreshAnalysis(activeCategoryName, category?.product_forms?.join(', '));
    }
  };

  // Loading state
  if (categoryLoading || isLoadingFromDb) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // No category selected
  if (!activeCategoryName || !category) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Category Selected</h3>
          <p className="text-muted-foreground max-w-md">
            Select a category from the Dashboard or start a new analysis to view market trends.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Processing state
  if (isProcessing || isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{activeCategoryName}</h1>
            <p className="text-muted-foreground">Market Trend Analysis</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <RefreshCw className="h-12 w-12 text-primary animate-spin mb-4" />
            <h3 className="text-xl font-semibold mb-2">Analyzing Market Trends...</h3>
            <p className="text-muted-foreground mb-4">
              AI is gathering market data and insights. This takes 2-4 minutes.
            </p>
            {pollingStatus.isPolling && (
              <Badge variant="secondary" className="text-sm">
                Checking... {Math.round((pollingStatus.attempt / pollingStatus.maxAttempts) * 100)}%
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{activeCategoryName}</h1>
            <p className="text-muted-foreground">Market Trend Analysis</p>
          </div>
          <Button onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Analysis
          </Button>
        </div>
        
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Analysis Failed</h3>
            <p className="text-muted-foreground max-w-md">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No analysis yet
  if (!hasAnalysis) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{activeCategoryName}</h1>
            <p className="text-muted-foreground">Market Trend Analysis</p>
          </div>
          <Button onClick={handleRefresh} disabled={isLoading}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Run Analysis
          </Button>
        </div>
        
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Market Analysis Yet</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              Click "Run Analysis" to generate comprehensive market trends powered by AI.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sections = analysis!.analysis!.sections;
  const generatedAt = analysis!.analysis!.generatedAt;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{activeCategoryName}</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Market Trend Analysis</span>
            {generatedAt && (
              <>
                <span>•</span>
                <span>Generated {format(new Date(generatedAt), 'MMM d, yyyy h:mm a')}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Sheet open={isChatOpen} onOpenChange={setIsChatOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                Ask AI
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:w-[50vw] sm:max-w-none p-0 flex flex-col">
              <SheetHeader className="px-4 py-3 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  Market Insights AI
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-hidden">
                <MarketTrendsChat
                  categoryId={category!.id}
                  categoryName={activeCategoryName}
                />
              </div>
            </SheetContent>
          </Sheet>
          <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabbed Sections */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Trends</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Products</span>
          </TabsTrigger>
          <TabsTrigger value="competition" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Competition</span>
          </TabsTrigger>
          <TabsTrigger value="consumers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Consumers</span>
          </TabsTrigger>
          <TabsTrigger value="outlook" className="flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            <span className="hidden sm:inline">Outlook</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <MarketOverviewSection data={sections.marketOverview} />
        </TabsContent>

        <TabsContent value="trends">
          <KeyTrendsSection data={sections.keyMarketTrends} />
        </TabsContent>

        <TabsContent value="products">
          <TopProductsSection data={sections.topProducts} />
        </TabsContent>

        <TabsContent value="competition">
          <CompetitiveLandscapeSection data={sections.competitiveLandscape} />
        </TabsContent>

        <TabsContent value="consumers">
          <ConsumerInsightsSection data={sections.consumerInsights} />
        </TabsContent>

        <TabsContent value="outlook">
          <FutureOutlookSection data={sections.futureOutlook} />
        </TabsContent>
      </Tabs>

      {/* Citations */}
      {analysis!.analysis!.citations && analysis!.analysis!.citations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sources & Citations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis!.analysis!.citations.map((citation, index) => (
                <li key={index}>
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {citation.title || citation.url}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Floating Chat Button */}
      <FloatingChatButton
        onClick={() => setIsChatOpen(true)}
        show={hasAnalysis}
      />
    </div>
  );
}
