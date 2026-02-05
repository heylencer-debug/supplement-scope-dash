import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Star, ArrowUpDown, MessageSquare, Award, Crown, Medal, Trophy, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ScrollAnimate } from "@/components/ui/scroll-animate";

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

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const rankIcons = [Crown, Trophy, Medal];
const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];

function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  
  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < fullStars
              ? 'fill-chart-4 text-chart-4'
              : i === fullStars && hasHalfStar
              ? 'fill-chart-4/50 text-chart-4'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
      <span className="ml-1.5 text-sm font-medium">{rating.toFixed(1)}</span>
    </div>
  );
}

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

  // Price distribution chart data
  const priceData = data.products.slice(0, 8).map((product, index) => ({
    name: product.brandProductName.length > 15 
      ? product.brandProductName.substring(0, 15) + '...' 
      : product.brandProductName,
    price: product.priceUsd,
    fullName: product.brandProductName,
  }));

  // Review count chart data
  const reviewData = data.products.slice(0, 5).map((product) => ({
    name: product.brandProductName.length > 12 
      ? product.brandProductName.substring(0, 12) + '...' 
      : product.brandProductName,
    reviews: product.numberOfReviews,
    fullName: product.brandProductName,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Insights */}
      <ScrollAnimate variant="fade-up">
        <Card className="overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-chart-4/5 via-transparent to-chart-2/5 pointer-events-none" />
          <CardHeader className="relative">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-chart-4/10">
                <Award className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <CardTitle className="text-lg">Market Summary</CardTitle>
                <CardDescription>Key insights from top-performing products</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <p className="text-foreground leading-relaxed">{data.summaryInsights}</p>
          </CardContent>
        </Card>
      </ScrollAnimate>

      {/* Visual Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Price Distribution */}
        <ScrollAnimate variant="scale-up" delay={100}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-chart-2" />
                <CardTitle className="text-lg">Price Distribution</CardTitle>
              </div>
              <CardDescription>Pricing across top products</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priceData} margin={{ bottom: 40 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      content={({ payload }) => {
                        if (payload && payload[0]) {
                          const d = payload[0].payload as any;
                          return (
                            <div className="bg-popover border rounded-lg p-2 shadow-lg">
                              <p className="font-medium text-sm">{d.fullName}</p>
                              <p className="text-primary font-bold">${d.price.toFixed(2)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="price" radius={[4, 4, 0, 0]}>
                      {priceData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </ScrollAnimate>

        {/* Review Count */}
        <ScrollAnimate variant="scale-up" delay={200}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-chart-1" />
                <CardTitle className="text-lg">Review Volume</CardTitle>
              </div>
              <CardDescription>Customer engagement by product</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reviewData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ payload }) => {
                        if (payload && payload[0]) {
                          const d = payload[0].payload as any;
                          return (
                            <div className="bg-popover border rounded-lg p-2 shadow-lg">
                              <p className="font-medium text-sm">{d.fullName}</p>
                              <p className="text-primary font-bold">{d.reviews.toLocaleString()} reviews</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="reviews" radius={[0, 4, 4, 0]}>
                      {reviewData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </ScrollAnimate>
      </div>

      {/* Products Table with Visual Enhancements */}
      <ScrollAnimate variant="fade-up" delay={300}>
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
                  {sortedProducts.map((product, index) => {
                    const RankIcon = product.rank <= 3 ? rankIcons[product.rank - 1] : null;
                    const rankColorClass = product.rank <= 3 ? rankColors[product.rank - 1] : '';
                    
                    return (
                      <TableRow key={index} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center justify-center">
                            {RankIcon ? (
                              <div className="relative">
                                <RankIcon className={`h-6 w-6 ${rankColorClass}`} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground font-medium">#{product.rank}</span>
                            )}
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
                          <Badge variant="outline" className="font-mono bg-chart-2/5 border-chart-2/20">
                            ${product.priceUsd.toFixed(2)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StarRating rating={product.averageRating} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {product.numberOfReviews >= 1000 
                                ? `${(product.numberOfReviews / 1000).toFixed(1)}k`
                                : product.numberOfReviews.toLocaleString()
                              }
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell max-w-xs">
                          <p className="text-sm text-muted-foreground truncate" title={product.keyFeatures}>
                            {product.keyFeatures}
                          </p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimate>
    </div>
  );
}
