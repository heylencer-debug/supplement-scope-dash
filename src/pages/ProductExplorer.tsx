import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, Download, Star, TrendingUp, Loader2, Eye, Calendar, DollarSign, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import ProductDetailModal from "@/components/ProductDetailModal";

export default function ProductExplorer() {
  const [searchParams] = useSearchParams();
  const urlCategoryName = searchParams.get("category");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("current");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  const isLoading = productsLoading || categoriesLoading;

  const filteredProducts = (products ?? []).filter((product) => {
    const matchesSearch =
      (product.title?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (product.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (product.asin?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesSearch;
  });

  const handleRowClick = (product: Product) => {
    setSelectedProduct(product);
    setModalOpen(true);
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
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead className="text-right">Reviews</TableHead>
                  <TableHead className="text-right">Mo. Sales</TableHead>
                  <TableHead className="text-right">Mo. Revenue</TableHead>
                  <TableHead className="text-right">BSR</TableHead>
                  <TableHead className="text-center">Age</TableHead>
                  <TableHead className="text-center">LQS</TableHead>
                  <TableHead className="text-center">Servings</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.slice(0, 50).map((product) => (
                  <TableRow
                    key={product.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(product)}
                  >
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
                    <TableCell className="text-right text-muted-foreground">
                      {product.monthly_sales?.toLocaleString() ?? "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {product.monthly_revenue 
                        ? `$${product.monthly_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {product.bsr_current?.toLocaleString() ?? "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{product.age_months != null ? `${product.age_months}mo` : "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {product.lqs != null ? (
                        <Badge 
                          variant="outline" 
                          className={
                            product.lqs >= 80 
                              ? "border-green-500/50 text-green-600 bg-green-500/10" 
                              : product.lqs >= 50 
                                ? "border-yellow-500/50 text-yellow-600 bg-yellow-500/10"
                                : "border-red-500/50 text-red-600 bg-red-500/10"
                          }
                        >
                          {product.lqs}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {product.servings_per_container ?? "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {product.bestseller && (
                          <Badge variant="default" className="bg-accent text-xs">
                            Bestseller
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
                ))}
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

      <ProductDetailModal
        product={selectedProduct}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
