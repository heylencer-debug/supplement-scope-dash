import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Filter, Download, Star, TrendingUp, Loader2, Eye, ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Beaker, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProducts, Product } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import { useBulkSupplementAnalysis } from "@/hooks/useBulkSupplementAnalysis";
import { BulkAnalysisProgress } from "@/components/BulkAnalysisProgress";
import ProductDetailModal from "@/components/ProductDetailModal";
import BenchmarkComparison from "@/components/dashboard/BenchmarkComparison";
import ProductAnalysisPanel from "@/components/product/ProductAnalysisPanel";
import { toast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const MAX_COMPARISON_PRODUCTS = 5;

type SortField = "price" | "rating" | "reviews" | "monthly_sales" | "monthly_revenue" | null;
type SortDirection = "asc" | "desc";

export default function ProductExplorer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawUrlCategoryName = searchParams.get("category");
  const urlCategoryName = rawUrlCategoryName ? rawUrlCategoryName.replace(/^=+/, "").trim() : null;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("current");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  // Filter states
  const [priceRange, setPriceRange] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const { currentCategoryId, categoryName: contextCategoryName, setCategoryContext } = useCategoryContext();
  const queryClient = useQueryClient();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use URL param or context as fallback
  const categoryName = urlCategoryName || contextCategoryName;
  
  // Look up category by name if we have a name but no ID
  const { data: categoryFromName } = useCategoryByName(
    categoryName && !currentCategoryId ? categoryName : undefined
  );

  // Update context when we find category from URL
  useEffect(() => {
    if (categoryFromName && !currentCategoryId) {
      setCategoryContext(categoryFromName.id, categoryFromName.name);
    } else if (urlCategoryName && !currentCategoryId && !categoryFromName) {
      // Store name even if category not found yet
      setCategoryContext(null, urlCategoryName);
    }
  }, [categoryFromName, currentCategoryId, urlCategoryName, setCategoryContext]);

  // Determine which category ID to use for filtering
  const effectiveCategoryId = categoryFilter === "current" && (currentCategoryId || categoryFromName?.id)
    ? currentCategoryId || categoryFromName?.id
    : categoryFilter === "all" || categoryFilter === "current"
      ? undefined
      : categoryFilter;

  const { data: products, isLoading: productsLoading } = useProducts(effectiveCategoryId);
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: categoryAnalysis } = useCategoryAnalysis(currentCategoryId || categoryFromName?.id);
  const effectiveCategoryIdForAnalysis = currentCategoryId || categoryFromName?.id;
  const { startBulkAnalysis, isAnalyzing: isBulkAnalyzing, progress: bulkProgress, resetProgress } = useBulkSupplementAnalysis(effectiveCategoryIdForAnalysis);

  const isLoading = productsLoading || categoriesLoading;

  // Real-time subscription for product updates during bulk analysis
  useEffect(() => {
    const categoryIdForRealtime = currentCategoryId || categoryFromName?.id;
    if (!categoryIdForRealtime) return;

    const channel = supabase
      .channel('product-explorer-realtime')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'products' }, 
        (payload) => {
          // Only invalidate if the updated product belongs to current category
          if ((payload.new as any).category_id === categoryIdForRealtime) {
            // Debounce invalidation to prevent excessive refetches
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ['products', categoryIdForRealtime] });
            }, 1000);
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [currentCategoryId, categoryFromName?.id, queryClient]);

  // Count products with low OCR confidence or missing amounts
  const lowConfidenceCount = useMemo(() => {
    if (!products) return 0;
    return products.filter(p => {
      if (p.ocr_confidence === 'low') return true;
      const nutrients = p.all_nutrients as Array<{ amount?: string | null }> | null;
      if (nutrients && nutrients.some(n => n.amount == null || n.amount === '')) return true;
      if (!nutrients || nutrients.length === 0) return true;
      return false;
    }).length;
  }, [products]);

  const handleBulkReanalyze = async () => {
    const categoryIdToUse = currentCategoryId || categoryFromName?.id;
    if (!categoryIdToUse) {
      toast({
        title: "No category selected",
        description: "Please select a category first.",
        variant: "destructive",
      });
      return;
    }
    await startBulkAnalysis(categoryIdToUse);
  };

  // Sorting handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="w-3 h-3 ml-1" /> 
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let result = (products ?? []).filter((product) => {
      // Search filter
      const matchesSearch =
        (product.title?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (product.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (product.asin?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      
      // Price filter
      const price = product.price ?? 0;
      const matchesPrice = priceRange === "all" ||
        (priceRange === "under20" && price < 20) ||
        (priceRange === "20to50" && price >= 20 && price <= 50) ||
        (priceRange === "over50" && price > 50);
      
      // Rating filter
      const rating = product.rating ?? 0;
      const matchesRating = ratingFilter === "all" ||
        (ratingFilter === "4plus" && rating >= 4) ||
        (ratingFilter === "3to4" && rating >= 3 && rating < 4) ||
        (ratingFilter === "under3" && rating < 3);
      
      // Status filter
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "bestseller" && product.bestseller) ||
        (statusFilter === "amazonchoice" && product.amazon_choice) ||
        (statusFilter === "young" && product.is_young_competitor);
      
      return matchesSearch && matchesPrice && matchesRating && matchesStatus;
    });

    // Apply sorting
    if (sortField) {
      result = [...result].sort((a, b) => {
        let aVal: number, bVal: number;
        switch (sortField) {
          case "price":
            aVal = a.price ?? 0;
            bVal = b.price ?? 0;
            break;
          case "rating":
            aVal = a.rating ?? 0;
            bVal = b.rating ?? 0;
            break;
          case "reviews":
            aVal = a.reviews ?? 0;
            bVal = b.reviews ?? 0;
            break;
          case "monthly_sales":
            aVal = a.monthly_sales ?? 0;
            bVal = b.monthly_sales ?? 0;
            break;
          case "monthly_revenue":
            aVal = a.monthly_revenue ?? 0;
            bVal = b.monthly_revenue ?? 0;
            break;
          default:
            return 0;
        }
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    return result;
  }, [products, searchQuery, priceRange, ratingFilter, statusFilter, sortField, sortDirection]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, priceRange, ratingFilter, statusFilter, categoryFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  const selectedProducts = filteredProducts.filter(p => selectedProductIds.has(p.id));

  const handleRowClick = (product: Product) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };

  const handleCheckboxChange = (productId: string, checked: boolean) => {
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        if (newSet.size >= MAX_COMPARISON_PRODUCTS) {
          toast({
            title: "Maximum reached",
            description: `You can only compare up to ${MAX_COMPARISON_PRODUCTS} products at a time.`,
            variant: "destructive",
          });
          return prev;
        }
        newSet.add(productId);
      } else {
        newSet.delete(productId);
      }
      return newSet;
    });
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(productId);
      return newSet;
    });
  };

  const handleClearAll = () => {
    setSelectedProductIds(new Set());
  };

  const toggleRowExpansion = (productId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const getMarketingScore = (product: Product) => {
    const ma = product.marketing_analysis as any;
    // Try score_card first (actual format), then fallback paths
    return ma?.score_card?.overall_score ?? ma?.overall_marketing_score?.overall_score ?? ma?.overall_marketing_score ?? null;
  };

  const getCopyScore = (product: Product) => {
    const ma = product.marketing_analysis as any;
    // Try score_card metrics, then fallback
    const copyMetric = ma?.score_card?.metrics?.find((m: any) => m.label === 'Copy');
    return copyMetric?.value ?? ma?.copy_effectiveness?.overall_copy_score ?? null;
  };

  const getTrustScore = (product: Product) => {
    const ma = product.marketing_analysis as any;
    return ma?.trust_signals?.trust_score ?? null;
  };

  const ScoreBadge = ({ score, label }: { score: number | null; label: string }) => {
    if (score === null) return null;
    const color = score >= 7 ? "text-chart-4 bg-chart-4/10" 
      : score >= 5 ? "text-chart-2 bg-chart-2/10" 
      : "text-destructive bg-destructive/10";
    return (
      <span className={`${color} text-xs px-1.5 py-0.5 rounded font-medium`}>
        {label[0]}:{score}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Bulk Analysis Progress Banner */}
      {bulkProgress.status !== "idle" && (
        <BulkAnalysisProgress 
          progress={bulkProgress} 
          onDismiss={resetProgress} 
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Explorer</h1>
          <p className="text-muted-foreground">
            {categoryName
              ? `Browsing products in: ${categoryName}`
              : "Browse and analyze products in detail"}
          </p>
        </div>
        <div className="flex gap-2">
          {(currentCategoryId || categoryFromName?.id) && lowConfidenceCount > 0 && (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleBulkReanalyze}
              disabled={isBulkAnalyzing}
            >
              {isBulkAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Beaker className="w-4 h-4" />
                  Re-analyze Formulas
                  <Badge variant="secondary" className="ml-1">{lowConfidenceCount}</Badge>
                </>
              )}
            </Button>
          )}
          <Button 
            variant="default" 
            className="gap-2"
            onClick={() => navigate(`/products/add?category=${encodeURIComponent(categoryName || "")}`)}
          >
            <Plus className="w-4 h-4" />
            Add Product
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search products, brands, or ASINs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-56">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by Category" />
                </SelectTrigger>
                <SelectContent>
                  {(currentCategoryId || categoryName) && (
                    <SelectItem value="current">
                      Current: {categoryName || "Selected Category"}
                    </SelectItem>
                  )}
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Filter row */}
            <div className="flex flex-wrap gap-3">
              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Price" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Prices</SelectItem>
                  <SelectItem value="under20">Under $20</SelectItem>
                  <SelectItem value="20to50">$20 - $50</SelectItem>
                  <SelectItem value="over50">Over $50</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ratings</SelectItem>
                  <SelectItem value="4plus">4+ Stars</SelectItem>
                  <SelectItem value="3to4">3-4 Stars</SelectItem>
                  <SelectItem value="under3">Under 3 Stars</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  <SelectItem value="bestseller">Bestsellers</SelectItem>
                  <SelectItem value="amazonchoice">Amazon's Choice</SelectItem>
                  <SelectItem value="young">Young Competitors</SelectItem>
                </SelectContent>
              </Select>
              
              {(priceRange !== "all" || ratingFilter !== "all" || statusFilter !== "all") && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setPriceRange("all");
                    setRatingFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-10">
                    <div className="flex items-center gap-2">
                      <span className="sr-only">Select</span>
                      {selectedProductIds.size > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedProductIds.size}
                        </Badge>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="w-14"></TableHead>
                  <TableHead className="min-w-0">Product</TableHead>
                  <TableHead className="text-right w-16">
                    <button 
                      className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                      onClick={() => handleSort("price")}
                    >
                      Price <SortIcon field="price" />
                    </button>
                  </TableHead>
                  <TableHead className="text-center w-16">
                    <button 
                      className="flex items-center justify-center w-full hover:text-foreground transition-colors"
                      onClick={() => handleSort("rating")}
                    >
                      Rating <SortIcon field="rating" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right w-20">
                    <button 
                      className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                      onClick={() => handleSort("reviews")}
                    >
                      Reviews <SortIcon field="reviews" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right w-20 hidden lg:table-cell">
                    <button 
                      className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                      onClick={() => handleSort("monthly_sales")}
                    >
                      Mo. Sales <SortIcon field="monthly_sales" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right w-24">
                    <button 
                      className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                      onClick={() => handleSort("monthly_revenue")}
                    >
                      Revenue <SortIcon field="monthly_revenue" />
                    </button>
                  </TableHead>
                  <TableHead className="text-center w-28">Scores</TableHead>
                  <TableHead className="text-center w-24 hidden lg:table-cell">Status</TableHead>
                  <TableHead className="text-center w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product) => {
                  const isSelected = selectedProductIds.has(product.id);
                  const isDisabled = !isSelected && selectedProductIds.size >= MAX_COMPARISON_PRODUCTS;
                  const isExpanded = expandedRows.has(product.id);
                  const hasAnalysisData = !!product.marketing_analysis || !!product.review_analysis;
                  
                  return (
                    <Collapsible key={product.id} open={isExpanded} onOpenChange={() => toggleRowExpansion(product.id)} asChild>
                      <>
                        <TableRow
                          className={`cursor-pointer hover:bg-muted/50 ${isSelected ? "bg-primary/5" : ""} ${isExpanded ? "border-b-0" : ""}`}
                          onClick={() => handleRowClick(product)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <CollapsibleTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-0 h-6 w-6"
                                disabled={!hasAnalysisData}
                              >
                                {hasAnalysisData ? (
                                  isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                                ) : (
                                  <span className="w-4 h-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              disabled={isDisabled}
                              onCheckedChange={(checked) => handleCheckboxChange(product.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="w-10 h-10 rounded-lg overflow-visible bg-muted flex-shrink-0 relative group">
                              {(product.main_image_url || product.image_url) ? (
                                <img 
                                  src={product.main_image_url || product.image_url || ''} 
                                  alt={product.title || 'Product'}
                                  className="w-full h-full object-cover rounded-lg transition-transform duration-200 group-hover:scale-[3] group-hover:z-50 group-hover:shadow-lg group-hover:relative"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs rounded-lg">
                                  N/A
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-md">
                              <p className="font-medium text-foreground truncate">{product.title ?? "Untitled"}</p>
                              <p className="text-sm text-muted-foreground">{product.brand ?? "Unknown Brand"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${(product.price ?? 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                              <span>{(product.rating ?? 0).toFixed(1)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {(product.reviews ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground hidden lg:table-cell">
                            {product.monthly_sales?.toLocaleString() ?? "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium text-chart-4">
                            {product.monthly_revenue 
                              ? `$${product.monthly_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              <ScoreBadge score={getMarketingScore(product)} label="Mkt" />
                              <ScoreBadge score={getCopyScore(product)} label="Copy" />
                              <ScoreBadge score={getTrustScore(product)} label="Trust" />
                            </div>
                          </TableCell>
                          <TableCell className="text-center hidden lg:table-cell">
                            <div className="flex items-center justify-center gap-1">
                              {product.bestseller && (
                                <Badge variant="default" className="text-xs">
                                  Best
                                </Badge>
                              )}
                              {product.amazon_choice && (
                                <Badge variant="secondary" className="text-xs">
                                  Choice
                                </Badge>
                              )}
                              {product.is_young_competitor && (
                                <TrendingUp className="w-4 h-4 text-chart-4" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRowClick(product);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <tr>
                            <td colSpan={12} className="p-0">
                              <ProductAnalysisPanel 
                                marketingAnalysis={product.marketing_analysis as any} 
                                reviewAnalysis={product.review_analysis as any}
                                imageUrls={product.image_urls as string[] | undefined}
                              />
                            </td>
                          </tr>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length} products
              </p>
              <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
              >
                First
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
              >
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                Next
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                Last
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <BenchmarkComparison
        selectedProducts={selectedProducts}
        analysis={categoryAnalysis ?? null}
        onRemoveProduct={handleRemoveProduct}
        onClearAll={handleClearAll}
      />

      <ProductDetailModal
        product={selectedProduct}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
