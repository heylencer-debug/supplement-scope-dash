import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Star, ArrowUpDown, MessageSquare, Award } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Product {
  rank: number;
  brandProductName: string;
  priceUsd: number;
  averageRating: number;
  numberOfReviews: number;
  keyFeatures: string;
  notableTrendsFromReviews: string;
}

interface TopProductsData {
  products: Product[];
  summaryInsights: string;
}

interface TopProductsSectionProps {
  data: TopProductsData;
}

type SortField = 'rank' | 'priceUsd' | 'averageRating' | 'numberOfReviews';
type SortDirection = 'asc' | 'desc';

export function TopProductsSection({ data }: TopProductsSectionProps) {
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedProducts = [...data.products].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    const direction = sortDirection === 'asc' ? 1 : -1;
    return (aValue - bValue) * direction;
  });

  return (
    <div className="space-y-6">
      {/* Summary Insights */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-chart-4" />
            <CardTitle className="text-lg">Market Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{data.summaryInsights}</p>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Top Products on Amazon</CardTitle>
          </div>
          <CardDescription>Click column headers to sort</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-16">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('rank')} className="h-8 -ml-3">
                      Rank
                      <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => handleSort('priceUsd')} className="h-8 -ml-3">
                      Price
                      <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => handleSort('averageRating')} className="h-8 -ml-3">
                      Rating
                      <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => handleSort('numberOfReviews')} className="h-8 -ml-3">
                      Reviews
                      <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Key Features</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProducts.map((product, index) => (
                  <TableRow key={index} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {product.rank <= 3 && (
                          <Badge variant={product.rank === 1 ? "default" : "secondary"} className="w-6 h-6 p-0 flex items-center justify-center">
                            {product.rank}
                          </Badge>
                        )}
                        {product.rank > 3 && <span className="text-muted-foreground">#{product.rank}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{product.brandProductName}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground lg:hidden">
                          <MessageSquare className="h-3 w-3" />
                          {product.notableTrendsFromReviews.substring(0, 50)}...
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        ${product.priceUsd.toFixed(2)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-chart-4 text-chart-4" />
                        <span className="font-medium">{product.averageRating.toFixed(1)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {product.numberOfReviews.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell max-w-xs">
                      <p className="text-sm text-muted-foreground truncate" title={product.keyFeatures}>
                        {product.keyFeatures}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
