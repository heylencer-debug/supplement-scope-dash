import { useState } from "react";
import { ArrowRight, Clock, TrendingUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const WEBHOOK_URL = "https://n8n.srv1075172.hstgr.cloud/webhook/bd007464-71c5-452a-8e4c-a8fc716d4316";

const amazonCategoryOptions = [
  { id: "health-household", label: "Health & Household" },
  { id: "sports-outdoors", label: "Sports & Outdoors" },
  { id: "beauty-personal-care", label: "Beauty & Personal Care" },
  { id: "pet-supplies", label: "Pet Supplies" },
];

const recentSearches = [
  { query: "Vitamin D3 5000 IU", category: "Vitamins", date: "2 hours ago" },
  { query: "Omega-3 Fish Oil", category: "Supplements", date: "Yesterday" },
  { query: "Probiotic 50 Billion", category: "Digestive Health", date: "2 days ago" },
];

const trendingCategories = [
  { name: "Immunity Boosters", growth: "+24%" },
  { name: "Sleep Support", growth: "+18%" },
  { name: "Joint Health", growth: "+15%" },
  { name: "Energy & Focus", growth: "+12%" },
];

export default function NewAnalysis() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [asin, setAsin] = useState("");
  const [amazonCategories, setAmazonCategories] = useState<string[]>([]);

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
      // Using no-cors mode since n8n workflows may not have Respond to Webhook node
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors",
        body: JSON.stringify(payload),
      });

      // With no-cors, we can't read the response, but the request was sent
      toast({
        title: "Analysis started!",
        description: "Check your email in 5-10 minutes.",
      });

      // Reset form
      setCategory("");
      setAsin("");
      setAmazonCategories([]);
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

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Recent Searches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentSearches.map((search, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors"
                  onClick={() => setCategory(search.query)}
                >
                  <div>
                    <p className="font-medium text-foreground">{search.query}</p>
                    <p className="text-sm text-muted-foreground">{search.category}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{search.date}</span>
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