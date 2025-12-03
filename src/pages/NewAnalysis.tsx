import { useState } from "react";
import { Search, Filter, ArrowRight, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("");

  const handleAnalysis = () => {
    console.log("Starting analysis for:", searchQuery, category);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">New Market Analysis</h1>
        <p className="text-muted-foreground">
          Enter search criteria to discover and analyze products in the supplement market
        </p>
      </div>

      <Card className="border-2 border-accent/20 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-accent" />
            Search & Discovery
          </CardTitle>
          <CardDescription>
            Enter keywords, product names, or ingredients to analyze
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search for products, ingredients, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48 h-12">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vitamins">Vitamins</SelectItem>
                <SelectItem value="supplements">Supplements</SelectItem>
                <SelectItem value="minerals">Minerals</SelectItem>
                <SelectItem value="probiotics">Probiotics</SelectItem>
                <SelectItem value="herbs">Herbs & Botanicals</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
              <Filter className="w-3 h-3 mr-1" /> High Opportunity
            </Badge>
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
              Price Range: $20-$50
            </Badge>
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
              Rating: 4+ Stars
            </Badge>
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
              Top Sellers Only
            </Badge>
          </div>

          <Button 
            onClick={handleAnalysis} 
            className="w-full h-12 text-base bg-accent hover:bg-accent/90"
            disabled={!searchQuery}
          >
            Start Analysis
            <ArrowRight className="w-4 h-4 ml-2" />
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
