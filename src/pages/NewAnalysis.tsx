import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, FileText, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRecentCategories, CategoryWithImages } from "@/hooks/useCategoryAnalyses";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

const PENDING_ANALYSES_KEY = "pending_analyses";

const WEBHOOK_URL = "https://n8n.srv1075172.hstgr.cloud/webhook/bd007464-71c5-452a-8e4c-a8fc716d4316";

const amazonCategoryOptions = [
  { id: "health-household", label: "Health & Household" },
  { id: "sports-outdoors", label: "Sports & Outdoors" },
  { id: "beauty-personal-care", label: "Beauty & Personal Care" },
  { id: "pet-supplies", label: "Pet Supplies" },
];

const demographicsOptions = [
  { id: "men", label: "Men" },
  { id: "women", label: "Women" },
  { id: "adults", label: "Adults" },
  { id: "kids", label: "Kids" },
  { id: "seniors", label: "Seniors" },
];

const productFormOptions = [
  { id: "gummy", label: "Gummy" },
  { id: "liquid", label: "Liquid" },
  { id: "powder", label: "Powder" },
  { id: "capsule", label: "Capsule" },
  { id: "tablet", label: "Tablet" },
  { id: "softgel", label: "Softgel" },
];


const getRecommendationStyle = (recommendation: string | null) => {
  if (!recommendation) return "bg-muted text-muted-foreground border-border";
  const rec = recommendation.toUpperCase();
  if (rec.includes('PROCEED')) return "bg-chart-4/10 text-chart-4 border-chart-4/20";
  if (rec.includes('CONSIDER') || rec.includes('CAUTION')) return "bg-chart-2/10 text-chart-2 border-chart-2/20";
  if (rec.includes('SKIP') || rec.includes('AVOID')) return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
};

export default function NewAnalysis() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [demographics, setDemographics] = useState<string[]>([]);
  const [productForm, setProductForm] = useState("");
  const [asin, setAsin] = useState("");
  const [amazonCategories, setAmazonCategories] = useState<string[]>([]);

  const { data: recentCategories, isLoading: categoriesLoading } = useRecentCategories();

  // Get unique categories by name (most recent first)
  const uniqueCategories = recentCategories?.reduce((acc, cat) => {
    if (!acc.find(a => a.name === cat.name)) {
      acc.push(cat);
    }
    return acc;
  }, [] as CategoryWithImages[]) ?? [];

  const handleCategoryToggle = (categoryLabel: string, checked: boolean) => {
    if (checked) {
      setAmazonCategories((prev) => [...prev, categoryLabel]);
    } else {
      setAmazonCategories((prev) => prev.filter((c) => c !== categoryLabel));
    }
  };

  const handleDemographicsToggle = (demo: string, checked: boolean) => {
    if (checked) {
      setDemographics((prev) => [...prev, demo]);
    } else {
      setDemographics((prev) => prev.filter((d) => d !== demo));
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

    if (demographics.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one demographic.",
        variant: "destructive",
      });
      return;
    }

    if (!productForm) {
      toast({
        title: "Error",
        description: "Please select a product form.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    // Build combined category name: "Magnesium Glycinate Gummy for Women"
    let fullCategoryName = category.trim();
    fullCategoryName = `${fullCategoryName} ${productForm}`;
    const demoString = demographics.join(' & ');
    fullCategoryName = `${fullCategoryName} for ${demoString}`;

    const payload = {
      category: fullCategoryName,
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

      // Add to pending analyses in localStorage
      const pending = JSON.parse(localStorage.getItem(PENDING_ANALYSES_KEY) || '[]');
      pending.push({ 
        categoryName: fullCategoryName, 
        startedAt: new Date().toISOString() 
      });
      localStorage.setItem(PENDING_ANALYSES_KEY, JSON.stringify(pending));

      // Dispatch custom event to notify AnalysisTabs
      window.dispatchEvent(new Event('newAnalysisAdded'));

      // Invalidate the analyses query cache
      queryClient.invalidateQueries({ queryKey: ['category_analyses'] });

      toast({
        title: "Analysis started!",
        description: "Check your email in 5-10 minutes.",
      });

      // Navigate to dashboard with category parameter
      navigate(`/dashboard?category=${encodeURIComponent(fullCategoryName)}`);
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
    // Add to pending analyses to create a tab (if not already there)
    const pending = JSON.parse(localStorage.getItem(PENDING_ANALYSES_KEY) || '[]');
    const alreadyPending = pending.some((p: { categoryName: string }) => p.categoryName === categoryName);
    
    if (!alreadyPending) {
      pending.push({ 
        categoryName, 
        startedAt: new Date().toISOString() 
      });
      localStorage.setItem(PENDING_ANALYSES_KEY, JSON.stringify(pending));
      window.dispatchEvent(new Event('newAnalysisAdded'));
    }
    
    navigate(`/dashboard?category=${encodeURIComponent(categoryName)}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-foreground">New Market Analysis</h1>
        <p className="text-muted-foreground">
          Enter your search criteria to analyze products in the supplement market
        </p>
      </div>

      <Card className="border-2 border-primary/20 shadow-lg">
        <CardHeader>
          <CardTitle>Start Analysis</CardTitle>
          <CardDescription>
            Configure your analysis parameters below
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
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

          {/* Demographics Field */}
          <div className="space-y-4">
            <Label>
              Target Demographics <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {demographicsOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center space-x-3 p-3 rounded-lg border bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <Checkbox
                    id={`demo-${option.id}`}
                    checked={demographics.includes(option.label)}
                    onCheckedChange={(checked) =>
                      handleDemographicsToggle(option.label, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`demo-${option.id}`}
                    className="text-sm font-medium cursor-pointer flex-1"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Product Form Field */}
          <div className="space-y-4">
            <Label>
              Product Form <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {productFormOptions.map((option) => (
                <div
                  key={option.id}
                  onClick={() => setProductForm(option.label)}
                  className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${
                    productForm === option.label
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/30 hover:bg-secondary/50 border-border"
                  }`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
              ))}
            </div>
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
          <div className="space-y-4">
            <Label>Amazon Categories</Label>
            <div className="grid grid-cols-2 gap-4">
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
            className="w-full h-12 text-base"
            disabled={isLoading || !category.trim() || demographics.length === 0 || !productForm}
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
            <FileText className="w-4 h-4 text-primary" />
            Recently Analyzed Categories
          </CardTitle>
          <CardDescription>
            Click to view the full analysis dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoriesLoading && !recentCategories ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          ) : uniqueCategories.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">
              No categories yet. Start your first analysis above!
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {uniqueCategories.slice(0, 6).map((category) => (
                <div
                  key={category.id}
                  onClick={() => handleAnalysisClick(category.name)}
                  className="group relative overflow-hidden rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                >
                  {/* Product Images Grid */}
                  <div className="grid grid-cols-2 gap-0.5 h-32 bg-muted/50">
                    {category.product_images && category.product_images.length > 0 ? (
                      category.product_images.slice(0, 4).map((img, idx) => (
                        <div key={idx} className="relative overflow-hidden bg-background">
                          <img 
                            src={img} 
                            alt="" 
                            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="col-span-2 flex items-center justify-center text-muted-foreground">
                        <Package className="w-8 h-8" />
                      </div>
                    )}
                    {/* Fill empty slots if less than 4 images */}
                    {category.product_images && category.product_images.length > 0 && category.product_images.length < 4 && (
                      Array.from({ length: 4 - category.product_images.length }).map((_, idx) => (
                        <div key={`empty-${idx}`} className="bg-muted/30" />
                      ))
                    )}
                  </div>
                  
                  {/* Card Content */}
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                        {category.name}
                      </h3>
                      {(() => {
                        const isComplete = category.total_products && category.total_products > 0;
                        const createdAt = category.created_at ? new Date(category.created_at) : null;
                        const hoursSinceCreation = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60) : 0;
                        const isCancelled = !isComplete && hoursSinceCreation > 12;
                        
                        if (isComplete) {
                          return (
                            <Badge variant="outline" className="text-xs shrink-0 bg-chart-4/10 text-chart-4 border-chart-4/20">
                              Complete
                            </Badge>
                          );
                        } else if (isCancelled) {
                          return (
                            <Badge variant="outline" className="text-xs shrink-0 bg-destructive/10 text-destructive border-destructive/20">
                              Cancelled
                            </Badge>
                          );
                        } else {
                          return (
                            <Badge variant="outline" className="text-xs shrink-0 bg-chart-2/10 text-chart-2 border-chart-2/20">
                              Processing
                            </Badge>
                          );
                        }
                      })()}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Package className="w-3.5 h-3.5" />
                        <span>{category.total_products || 0} products</span>
                      </div>
                      {category.created_at && (
                        <span className="text-xs">
                          {formatDistanceToNow(new Date(category.created_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
