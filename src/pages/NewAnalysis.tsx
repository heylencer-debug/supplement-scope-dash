import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, FileText, Package, Search, Target, Upload, X, Trash2, ChevronLeft, ChevronRight, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useRecentCategories, CategoryWithImages } from "@/hooks/useCategoryAnalyses";
import { useDeleteCategory } from "@/hooks/useDeleteCategory";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PENDING_ANALYSES_KEY = "pending_analyses";

const WEBHOOK_URL = "https://n8n.srv1075172.hstgr.cloud/webhook/bd007464-71c5-452a-8e4c-a8fc716d4316";

const amazonCategoryOptions = [
  "Appliances",
  "Arts, Crafts & Sewing",
  "Automotive",
  "Baby",
  "Beauty & Personal Care",
  "Camera & Photo",
  "Cell Phones & Accessories",
  "Clothing, Shoes & Jewelry",
  "Computers & Accessories",
  "Electronics",
  "Grocery & Gourmet Food",
  "Health & Household",
  "Home & Kitchen",
  "Industrial & Scientific",
  "Kitchen & Dining",
  "Musical Instruments",
  "Office Products",
  "Patio, Lawn & Garden",
  "Pet Supplies",
  "Software",
  "Sports & Outdoors",
  "Tools & Home Improvement",
  "Toys & Games",
  "Video Games",
];


const productFormOptions = [
  { id: "gummy", label: "Gummy" },
  { id: "liquid", label: "Liquid" },
  { id: "powder", label: "Powder" },
  { id: "capsule", label: "Capsule" },
  { id: "tablet", label: "Tablet" },
  { id: "softgel", label: "Softgel" },
  { id: "soft-chew", label: "Soft Chew" },
  { id: "treat", label: "Treat" },
  { id: "chewable", label: "Chewable" },
  { id: "oil", label: "Oil" },
  { id: "spray", label: "Spray" },
  { id: "drops", label: "Drops" },
  { id: "bites", label: "Bites" },
];

type AnalysisMode = "category" | "targeted";

// Parse ASINs from text input (handles comma, space, newline separators)
const parseAsins = (input: string): string[] => {
  return input
    .split(/[\s,\n]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^B0[A-Z0-9]{8}$/i.test(s));
};


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
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("category");
  const [category, setCategory] = useState("");
  const [productForms, setProductForms] = useState<string[]>([]);
  const [amazonCategories, setAmazonCategories] = useState<string[]>([]);
  const [asinInput, setAsinInput] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  
  // Delete dialog state
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryWithImages | null>(null);
  const deleteCategory = useDeleteCategory();

  const { data: recentCategories, isLoading: categoriesLoading } = useRecentCategories();

  // Get unique categories by name (most recent first)
  const uniqueCategories = recentCategories?.reduce((acc, cat) => {
    if (!acc.find(a => a.name === cat.name)) {
      acc.push(cat);
    }
    return acc;
  }, [] as CategoryWithImages[]) ?? [];

  // Pagination calculations
  const totalPages = Math.ceil(uniqueCategories.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCategories = uniqueCategories.slice(startIndex, startIndex + itemsPerPage);

  const parsedAsins = parseAsins(asinInput);

  const handleCategoryToggle = (categoryLabel: string, checked: boolean) => {
    if (checked) {
      setAmazonCategories((prev) => [...prev, categoryLabel]);
    } else {
      setAmazonCategories((prev) => prev.filter((c) => c !== categoryLabel));
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];
    const validExtensions = ['.csv', '.txt'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!validTypes.includes(file.type) && !hasValidExtension) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV or TXT file.",
        variant: "destructive",
      });
      return;
    }

    // Read file contents
    const reader = new FileReader();
    reader.onload = (e) => {
      const contents = e.target?.result as string;
      if (contents) {
        // Append to existing ASINs (or replace if empty)
        const newAsins = parseAsins(contents);
        if (newAsins.length === 0) {
          toast({
            title: "No ASINs found",
            description: "The file didn't contain any valid ASINs.",
            variant: "destructive",
          });
          return;
        }

        // Merge with existing ASINs, removing duplicates
        const existingAsins = parseAsins(asinInput);
        const mergedAsins = [...new Set([...existingAsins, ...newAsins])];
        setAsinInput(mergedAsins.join('\n'));
        setUploadedFileName(file.name);
        
        toast({
          title: "ASINs imported",
          description: `Added ${newAsins.length} ASIN${newAsins.length !== 1 ? 's' : ''} from ${file.name}`,
        });
      }
    };
    reader.readAsText(file);
    
    // Reset file input so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearUploadedFile = () => {
    setUploadedFileName(null);
  };


  const handleAnalysis = async () => {
    if (!category.trim()) {
      toast({
        title: "Error",
        description: "Please enter a category/analysis name.",
        variant: "destructive",
      });
      return;
    }

    if (analysisMode === "category" && productForms.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one product form.",
        variant: "destructive",
      });
      return;
    }

    if (analysisMode === "targeted" && parsedAsins.length === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one valid ASIN.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    let payload: Record<string, unknown>;
    let displayCategoryName: string;

    if (analysisMode === "targeted") {
      // Targeted Analysis payload
      payload = {
        category: category.trim(),
        asins: parsedAsins,
        amazon_categories: amazonCategories.length > 0 ? amazonCategories : null,
        ASIN: parsedAsins[0], // First ASIN as primary
      };
      displayCategoryName = category.trim();
    } else {
      // Category Search payload (existing behavior)
      // Convert IDs to labels for display name
      const formLabels = productForms.map(id => {
        const form = productFormOptions.find(f => f.id === id);
        return form ? form.label : id;
      });
      payload = {
        category: category.trim(),
        product_form: productForms, // IDs like "gummy", "powder"
        amazon_categories: amazonCategories.length > 0 ? amazonCategories : null,
      };
      displayCategoryName = `${category.trim()} ${formLabels.join(" & ")}`;
    }

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
        categoryName: displayCategoryName, 
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
      navigate(`/dashboard?category=${encodeURIComponent(displayCategoryName)}`);
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

  const handleDeleteClick = (e: React.MouseEvent, cat: CategoryWithImages) => {
    e.stopPropagation();
    setCategoryToDelete(cat);
  };

  const confirmDelete = async () => {
    if (categoryToDelete) {
      await deleteCategory.mutateAsync(categoryToDelete.id);
      setCategoryToDelete(null);
      // Reset to first page if current page becomes empty
      if (paginatedCategories.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    }
  };

  const handleCopyAsins = async (e: React.MouseEvent, categoryId: string) => {
    e.stopPropagation();
    
    try {
      const { data, error } = await supabase
        .from("products")
        .select("asin")
        .eq("category_id", categoryId);
      
      if (error) throw error;
      
      const asins = data
        .map(p => p.asin)
        .filter((asin): asin is string => !!asin);
      
      if (asins.length === 0) {
        toast({
          title: "No ASINs found",
          description: "This category has no products with ASINs.",
          variant: "destructive",
        });
        return;
      }
      
      await navigator.clipboard.writeText(asins.join(", "));
      
      toast({
        title: "ASINs copied!",
        description: `${asins.length} ASIN${asins.length !== 1 ? 's' : ''} copied to clipboard.`,
      });
    } catch (error) {
      console.error("Failed to copy ASINs:", error);
      toast({
        title: "Error",
        description: "Failed to copy ASINs.",
        variant: "destructive",
      });
    }
  };


  const isFormValid = analysisMode === "category" 
    ? category.trim() && productForms.length > 0
    : category.trim() && parsedAsins.length > 0;

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
          {/* Analysis Mode Toggle */}
          <div className="space-y-2">
            <Label>Analysis Mode</Label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setAnalysisMode("category")}
                className={`flex items-center justify-center gap-2 p-4 rounded-lg border cursor-pointer transition-all duration-200 active:scale-95 hover:-translate-y-0.5 ${
                  analysisMode === "category"
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_12px_rgba(67,24,255,0.3)] scale-[1.02]"
                    : "bg-secondary/30 hover:bg-secondary/50 border-border hover:shadow-soft"
                }`}
              >
                <Search className="w-4 h-4" />
                <span className="font-medium">Category Search</span>
              </div>
              <div
                onClick={() => setAnalysisMode("targeted")}
                className={`flex items-center justify-center gap-2 p-4 rounded-lg border cursor-pointer transition-all duration-200 active:scale-95 hover:-translate-y-0.5 ${
                  analysisMode === "targeted"
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_12px_rgba(67,24,255,0.3)] scale-[1.02]"
                    : "bg-secondary/30 hover:bg-secondary/50 border-border hover:shadow-soft"
                }`}
              >
                <Target className="w-4 h-4" />
                <span className="font-medium">Targeted Analysis</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {analysisMode === "category" 
                ? "Search by category keywords and product forms" 
                : "Analyze specific products by entering their ASINs"}
            </p>
          </div>

          {/* Category Name Field */}
          <div className="space-y-2">
            <Label htmlFor="category">
              {analysisMode === "targeted" ? "Analysis Name" : "Category to Analyze"} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="category"
              placeholder={analysisMode === "targeted" ? "e.g., My Competitor Batch" : "e.g., Magnesium Glycinate, Lion's Mane"}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-12"
            />
          </div>

          {/* Conditional: Product Form (Category mode only) */}
          {analysisMode === "category" && (
            <div className="space-y-4">
              <Label>
                Product Form <span className="text-destructive">*</span>
                <span className="text-muted-foreground text-xs ml-2">(select one or more)</span>
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {productFormOptions.map((option) => {
                  const isSelected = productForms.includes(option.id);
                  return (
                    <div
                      key={option.id}
                      onClick={() => {
                        if (isSelected) {
                          setProductForms((prev) => prev.filter((f) => f !== option.id));
                        } else {
                          setProductForms((prev) => [...prev, option.id]);
                        }
                      }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all duration-200 active:scale-95 hover:-translate-y-0.5 ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_12px_rgba(67,24,255,0.3)] scale-[1.02]"
                          : "bg-secondary/30 hover:bg-secondary/50 border-border hover:shadow-soft"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-4 h-4 animate-check-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      <span className="text-sm font-medium">{option.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conditional: ASIN Input (Targeted mode only) */}
          {analysisMode === "targeted" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="asins">
                  ASINs <span className="text-destructive">*</span>
                  <span className="text-muted-foreground text-xs ml-2">(one per line or comma-separated)</span>
                </Label>
                <div className="flex items-center gap-2">
                  {uploadedFileName && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <FileText className="w-3 h-3" />
                      {uploadedFileName}
                      <button 
                        onClick={clearUploadedFile}
                        className="ml-1 hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import CSV
                  </Button>
                </div>
              </div>
              <Textarea
                id="asins"
                placeholder="B01XXXXXXX&#10;B02XXXXXXX&#10;B03XXXXXXX"
                value={asinInput}
                onChange={(e) => setAsinInput(e.target.value)}
                className="min-h-[120px] font-mono text-sm"
              />
              {asinInput.trim() && (
                <p className="text-xs text-muted-foreground">
                  {parsedAsins.length > 0 ? (
                    <span className="text-chart-4">{parsedAsins.length} valid ASIN{parsedAsins.length !== 1 ? 's' : ''} detected</span>
                  ) : (
                    <span className="text-destructive">No valid ASINs detected (format: B0XXXXXXXXX)</span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Amazon Categories Multi-select */}
          <div className="space-y-4">
            <Label>Amazon Category</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {amazonCategoryOptions.map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-3 rounded-lg border bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <Checkbox
                    id={`amazon-${option}`}
                    checked={amazonCategories.includes(option)}
                    onCheckedChange={(checked) =>
                      handleCategoryToggle(option, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`amazon-${option}`}
                    className="text-sm font-medium cursor-pointer flex-1"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Category Name Preview */}
          {category.trim() && (
            (analysisMode === "category" && productForms.length > 0) || 
            (analysisMode === "targeted" && parsedAsins.length > 0)
          ) && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">Analysis will be created as:</p>
              <p className="font-semibold text-foreground">
                {analysisMode === "targeted" 
                  ? `${category.trim()} (${parsedAsins.length} product${parsedAsins.length !== 1 ? 's' : ''})`
                  : `${category.trim()} ${productForms.join(" & ")}`}
              </p>
            </div>
          )}

          <Button
            onClick={handleAnalysis}
            className="w-full h-12 text-base"
            disabled={isLoading || !isFormValid}
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
        <CardContent className="space-y-6">
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
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedCategories.map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => handleAnalysisClick(cat.name)}
                    className="group relative overflow-hidden rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                  >
                    {/* Action Buttons */}
                    <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur-sm hover:bg-primary hover:text-primary-foreground"
                        onClick={(e) => handleCopyAsins(e, cat.id)}
                        title="Copy ASINs"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => handleDeleteClick(e, cat)}
                        disabled={deleteCategory.isPending}
                        title="Delete category"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Product Images Grid */}
                    <div className="grid grid-cols-2 gap-0.5 h-32 bg-muted/50">
                      {cat.product_images && cat.product_images.length > 0 ? (
                        cat.product_images.slice(0, 4).map((img, idx) => (
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
                      {cat.product_images && cat.product_images.length > 0 && cat.product_images.length < 4 && (
                        Array.from({ length: 4 - cat.product_images.length }).map((_, idx) => (
                          <div key={`empty-${idx}`} className="bg-muted/30" />
                        ))
                      )}
                    </div>
                    
                    {/* Card Content */}
                    <div className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                          {cat.name}
                        </h3>
                        {(() => {
                          const isComplete = cat.total_products && cat.total_products > 0;
                          const createdAt = cat.created_at ? new Date(cat.created_at) : null;
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
                          <span>{cat.total_products || 0} products</span>
                        </div>
                        {cat.created_at && (
                          <span className="text-xs">
                            {formatDistanceToNow(new Date(cat.created_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, uniqueCategories.length)} of {uniqueCategories.length} categories
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "ghost"}
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">"{categoryToDelete?.name}"</span>?
              <br /><br />
              This will permanently remove:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All products ({categoryToDelete?.total_products || 0})</li>
                <li>All reviews and analysis data</li>
                <li>Formula briefs and recommendations</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCategory.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteCategory.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCategory.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
