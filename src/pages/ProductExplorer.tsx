import { useState } from "react";
import { Search, Filter, Download, ChevronDown, Star, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mockProducts = [
  {
    id: 1,
    name: "Vitamin D3 5000 IU",
    brand: "Nature's Best",
    category: "Vitamins",
    price: 24.99,
    rating: 4.7,
    reviews: 12453,
    opportunityScore: 85,
    trend: "up",
  },
  {
    id: 2,
    name: "Omega-3 Fish Oil 1000mg",
    brand: "Pure Health",
    category: "Supplements",
    price: 32.99,
    rating: 4.5,
    reviews: 8921,
    opportunityScore: 78,
    trend: "up",
  },
  {
    id: 3,
    name: "Probiotic 50 Billion CFU",
    brand: "GutBalance",
    category: "Digestive Health",
    price: 39.99,
    rating: 4.8,
    reviews: 6234,
    opportunityScore: 92,
    trend: "up",
  },
  {
    id: 4,
    name: "Magnesium Glycinate 400mg",
    brand: "MineralPro",
    category: "Minerals",
    price: 19.99,
    rating: 4.6,
    reviews: 4567,
    opportunityScore: 71,
    trend: "stable",
  },
  {
    id: 5,
    name: "Ashwagandha Root Extract",
    brand: "HerbalLife",
    category: "Herbs",
    price: 22.99,
    rating: 4.4,
    reviews: 9876,
    opportunityScore: 88,
    trend: "up",
  },
  {
    id: 6,
    name: "Zinc Picolinate 50mg",
    brand: "Immunity Plus",
    category: "Minerals",
    price: 15.99,
    rating: 4.3,
    reviews: 3421,
    opportunityScore: 65,
    trend: "down",
  },
];

export default function ProductExplorer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filteredProducts = mockProducts.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Explorer</h1>
          <p className="text-muted-foreground">Browse and analyze products in detail</p>
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
                placeholder="Search products or brands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Vitamins">Vitamins</SelectItem>
                <SelectItem value="Supplements">Supplements</SelectItem>
                <SelectItem value="Minerals">Minerals</SelectItem>
                <SelectItem value="Digestive Health">Digestive Health</SelectItem>
                <SelectItem value="Herbs">Herbs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead className="text-right">Reviews</TableHead>
                  <TableHead className="text-center">Opportunity</TableHead>
                  <TableHead className="text-center">Trend</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.brand}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{product.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${product.price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span>{product.rating}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {product.reviews.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={getScoreBadgeVariant(product.opportunityScore)}
                        className={product.opportunityScore >= 80 ? "bg-accent text-accent-foreground" : ""}
                      >
                        {product.opportunityScore}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <TrendingUp
                        className={`w-4 h-4 mx-auto ${
                          product.trend === "up"
                            ? "text-green-500"
                            : product.trend === "down"
                            ? "text-red-500 rotate-180"
                            : "text-muted-foreground rotate-90"
                        }`}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>View Details</DropdownMenuItem>
                          <DropdownMenuItem>Add to Analysis</DropdownMenuItem>
                          <DropdownMenuItem>Export Data</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredProducts.length} of {mockProducts.length} products
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
