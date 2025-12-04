import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, Download, Star, TrendingUp, Loader2, Eye, ChevronDown, ChevronRight } from "lucide-react";
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
import { useProducts, Product } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import ProductDetailModal from "@/components/ProductDetailModal";
import BenchmarkComparison from "@/components/dashboard/BenchmarkComparison";
import ProductAnalysisPanel from "@/components/product/ProductAnalysisPanel";
import { toast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const MAX_COMPARISON_PRODUCTS = 5;

export default function ProductExplorer() {
  const [searchParams] = useSearchParams();
  const urlCategoryName = searchParams.get("category");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("current");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { currentCategoryId, categoryName: contextCategoryName, setCategoryContext } = useCategoryContext();
  
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

  const isLoading = productsLoading || categoriesLoading;

  const filteredProducts = (products ?? []).filter((product) => {
    const matchesSearch =
      (product.title?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (product.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (product.asin?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesSearch;
  });

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
    const color = score >= 7 ? "text-green-600 bg-green-500/10" 
      : score >= 5 ? "text-yellow-600 bg-yellow-500/10" 
      : "text-red-600 bg-red-500/10";
    return (
      <span className={`${color} text-xs px-1.5 py-0.5 rounded font-medium`}>
        {label[0]}:{score}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Explorer</h1>
          <p className="text-muted-foreground">
            {categoryName
              ? `Browsing products in: ${categoryName}`
              : "Browse and analyze products in detail"}
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
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
                  <TableHead className="min-w-0">Product</TableHead>
                  <TableHead className="text-right w-16">Price</TableHead>
                  <TableHead className="text-center w-16">Rating</TableHead>
                  <TableHead className="text-right w-20">Reviews</TableHead>
                  <TableHead className="text-right w-20 hidden lg:table-cell">Mo. Sales</TableHead>
                  <TableHead className="text-right w-24">Revenue</TableHead>
                  <TableHead className="text-center w-28">Scores</TableHead>
                  <TableHead className="text-center w-24 hidden lg:table-cell">Status</TableHead>
                  <TableHead className="text-center w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.slice(0, 50).map((product) => {
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
                          <TableCell className="text-right font-medium text-green-600">
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
                                <Badge variant="default" className="bg-accent text-xs">
                                  Best
                                </Badge>
                              )}
                              {product.amazon_choice && (
                                <Badge variant="secondary" className="text-xs">
                                  Choice
                                </Badge>
                              )}
                              {product.is_young_competitor && (
                                <TrendingUp className="w-4 h-4 text-green-500" />
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
                            <td colSpan={11} className="p-0">
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
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {Math.min(filteredProducts.length, 50)} of {filteredProducts.length} products
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={filteredProducts.length <= 50}>
                Next
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
