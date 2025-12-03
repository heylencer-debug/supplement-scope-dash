import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock, TrendingUp, Loader2, Target, FileText, Package, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCategoryAnalyses } from "@/hooks/useCategoryAnalyses";
import { formatDistanceToNow } from "date-fns";

const WEBHOOK_URL = "https://n8n.srv1075172.hstgr.cloud/webhook/bd007464-71c5-452a-8e4c-a8fc716d4316";

const amazonCategoryOptions = [
  { id: "health-household", label: "Health & Household" },
  { id: "sports-outdoors", label: "Sports & Outdoors" },
  { id: "beauty-personal-care", label: "Beauty & Personal Care" },
  { id: "pet-supplies", label: "Pet Supplies" },
];

const trendingCategories = [
  { name: "Immunity Boosters", growth: "+24%" },
  { name: "Sleep Support", growth: "+18%" },
  { name: "Joint Health", growth: "+15%" },
  { name: "Energy & Focus", growth: "+12%" },
];

const getRecommendationStyle = (recommendation: string | null) => {
  if (!recommendation) return "bg-muted text-muted-foreground border-border";
  const rec = recommendation.toUpperCase();
  if (rec.includes('PROCEED')) return "bg-green-500/10 text-green-600 border-green-500/20";
  if (rec.includes('CONSIDER') || rec.includes('CAUTION')) return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  if (rec.includes('SKIP') || rec.includes('AVOID')) return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
};

export default function NewAnalysis() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [asin, setAsin] = useState("");
  const [amazonCategories, setAmazonCategories] = useState<string[]>([]);

  const { data: recentAnalyses, isLoading: analysesLoading } = useCategoryAnalyses();

  // Get unique analyses by category name (most recent first)
  const uniqueAnalyses = recentAnalyses?.reduce((acc, analysis) => {
    if (!acc.find(a => a.category_name === analysis.category_name)) {
      acc.push(analysis);
    }
    return acc;
  }, [] as typeof recentAnalyses) ?? [];

  const handleCategoryToggle = (categoryLabel: string, checked: boolean) => {
    if (checked) {
      setAmazonCategories((prev) => [...prev, categoryLabel]);
    } else {
      setAmazonCategories((prev) => prev.filter((c) => c !== categoryLabel));
    }
  };

  const handleAnalysis = async () => {
    if (!category.trim()) {
      toast({
        title: "Error",
        description: "Please enter a category to analyze.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const payload = {
      category: category.trim(),
      ASIN: asin.trim() || null,
      amazon_categories: amazonCategories.length > 0 ? amazonCategories : null,
    };

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      toast({
        title: "Analysis started!",
        description: "Check your email in 5-10 minutes.",
      });

      // Navigate to dashboard with category parameter
      navigate(`/dashboard?category=${encodeURIComponent(category.trim())}`);
    } catch (error) {
      console.error("Analysis request failed:", error);
      toast({
        title: "Error",
        description: "Failed to start analysis. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalysisClick = (categoryName: string) => {
    navigate(`/dashboard?category=${encodeURIComponent(categoryName)}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">New Market Analysis</h1>
        <p className="text-muted-foreground">
          Enter your search criteria to analyze products in the supplement market
        </p>
      </div>

      <Card className="border-2 border-accent/20 shadow-lg">
        <CardHeader>
          <CardTitle>Start Analysis</CardTitle>
          <CardDescription>
            Configure your analysis parameters below
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Category Name Field */}
          <div className="space-y-2">
            <Label htmlFor="category">
              Category to Analyze <span className="text-destructive">*</span>
            </Label>
            <Input
              id="category"
              placeholder="e.g., Magnesium Glycinate, Lion's Mane"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-12"
            />
          </div>

          {/* Target ASINs Field */}
          <div className="space-y-2">
            <Label htmlFor="ASIN">Specific Competitor ASINs</Label>
            <Input
              id="ASIN"
              placeholder="Enter ASINs separated by commas"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              className="h-12"
            />
            <p className="text-xs text-muted-foreground">Optional - Leave blank to analyze all products in the category</p>
          </div>

          {/* Amazon Categories Multi-select */}
          <div className="space-y-3">
            <Label>Amazon Categories</Label>
            <div className="grid grid-cols-2 gap-3">
              {amazonCategoryOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center space-x-3 p-3 rounded-lg border bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <Checkbox
                    id={option.id}
                    checked={amazonCategories.includes(option.label)}
                    onCheckedChange={(checked) =>
                      handleCategoryToggle(option.label, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={option.id}
                    className="text-sm font-medium cursor-pointer flex-1"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={handleAnalysis}
            className="w-full h-12 text-base bg-accent hover:bg-accent/90"
            disabled={isLoading || !category.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                Start Analysis
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Recently Analyzed Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-4 h-4 text-accent" />
            Recently Analyzed Categories
          </CardTitle>
          <CardDescription>
            Click to view the full analysis dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : uniqueAnalyses.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No analyses yet. Start your first analysis above!
            </p>
          ) : (
            <div className="space-y-3">
              {uniqueAnalyses.slice(0, 5).map((analysis) => (
                <div
                  key={analysis.id}
                  onClick={() => handleAnalysisClick(analysis.category_name)}
                  className="p-4 rounded-lg border bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">
                        {analysis.category_name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        {analysis.opportunity_index && (
                          <span className="flex items-center gap-1">
                            <Target className="w-3.5 h-3.5" />
                            {Number(analysis.opportunity_index).toFixed(1)}/10
                          </span>
                        )}
                        {analysis.products_analyzed != null && (
                          <span className="flex items-center gap-1">
                            <Package className="w-3.5 h-3.5" />
                            {analysis.products_analyzed} products
                          </span>
                        )}
                        {analysis.reviews_analyzed != null && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {analysis.reviews_analyzed.toLocaleString()} reviews
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {analysis.recommendation && (
                        <Badge 
                          variant="outline" 
                          className={`text-xs whitespace-nowrap ${getRecommendationStyle(analysis.recommendation)}`}
                        >
                          {analysis.recommendation}
                        </Badge>
                      )}
                      {analysis.created_at && (
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  {analysis.executive_summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {analysis.executive_summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Quick Start
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { query: "Vitamin D3 5000 IU", category: "Vitamins" },
                { query: "Omega-3 Fish Oil", category: "Supplements" },
                { query: "Probiotic 50 Billion", category: "Digestive Health" },
              ].map((search, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors"
                  onClick={() => setCategory(search.query)}
                >
                  <div>
                    <p className="font-medium text-foreground">{search.query}</p>
                    <p className="text-sm text-muted-foreground">{search.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-4 h-4 text-accent" />
              Trending Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trendingCategories.map((cat, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors"
                  onClick={() => setCategory(cat.name)}
                >
                  <span className="font-medium text-foreground">{cat.name}</span>
                  <Badge className="bg-accent/10 text-accent hover:bg-accent/20">
                    {cat.growth}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
