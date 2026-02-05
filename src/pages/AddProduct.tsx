import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, ArrowLeft, Save, Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories } from "@/hooks/useCategories";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useAddProduct, ProductFormData } from "@/hooks/useAddProduct";
import { toast } from "@/hooks/use-toast";

interface Ingredient {
  id: string;
  name: string;
  amount: string;
  unit: string;
  daily_value: string;
}

const productSchema = z.object({
  asin: z.string().min(10, "ASIN must be at least 10 characters").max(12),
  title: z.string().min(5, "Title must be at least 5 characters").max(500),
  brand: z.string().min(1, "Brand is required").max(100),
  price: z.number().positive().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviews: z.number().int().min(0).nullable(),
});

export default function AddProduct() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawCategoryName = searchParams.get("category");
  const categoryName = rawCategoryName?.replace(/^=+/, "").trim();
  
  const { currentCategoryId } = useCategoryContext();
  const { data: categoryFromName } = useCategoryByName(categoryName);
  const { data: categories } = useCategories();
  const addProduct = useAddProduct();
  
  const effectiveCategoryId = currentCategoryId || categoryFromName?.id || "";

  // Form state
  const [asin, setAsin] = useState("");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");
  const [rating, setRating] = useState("");
  const [reviews, setReviews] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(effectiveCategoryId);
  
  // Supplement facts state
  const [servingSize, setServingSize] = useState("");
  const [servingsPerContainer, setServingsPerContainer] = useState("");
  const [otherIngredients, setOtherIngredients] = useState("");
  const [directions, setDirections] = useState("");
  const [warnings, setWarnings] = useState("");
  const [claimInput, setClaimInput] = useState("");
  const [claims, setClaims] = useState<string[]>([]);
  
  // Ingredients state
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { id: crypto.randomUUID(), name: "", amount: "", unit: "mg", daily_value: "" }
  ]);

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      { id: crypto.randomUUID(), name: "", amount: "", unit: "mg", daily_value: "" }
    ]);
  };

  const removeIngredient = (id: string) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter(ing => ing.id !== id));
    }
  };

  const updateIngredient = (id: string, field: keyof Ingredient, value: string) => {
    setIngredients(ingredients.map(ing =>
      ing.id === id ? { ...ing, [field]: value } : ing
    ));
  };

  const addClaim = () => {
    const trimmed = claimInput.trim();
    if (trimmed && !claims.includes(trimmed)) {
      setClaims([...claims, trimmed]);
      setClaimInput("");
    }
  };

  const removeClaim = (claim: string) => {
    setClaims(claims.filter(c => c !== claim));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate basic fields
    const validation = productSchema.safeParse({
      asin,
      title,
      brand,
      price: price ? parseFloat(price) : null,
      rating: rating ? parseFloat(rating) : null,
      reviews: reviews ? parseInt(reviews, 10) : null,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast({
        title: "Validation Error",
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }

    if (!selectedCategoryId) {
      toast({
        title: "Category Required",
        description: "Please select a category for this product.",
        variant: "destructive",
      });
      return;
    }

    // Filter out empty ingredients
    const validIngredients = ingredients.filter(ing => ing.name.trim() && ing.amount.trim());
    
    if (validIngredients.length === 0) {
      toast({
        title: "Ingredients Required",
        description: "Please add at least one ingredient.",
        variant: "destructive",
      });
      return;
    }

    const formData: ProductFormData = {
      asin,
      title,
      brand,
      price: price ? parseFloat(price) : null,
      rating: rating ? parseFloat(rating) : null,
      reviews: reviews ? parseInt(reviews, 10) : null,
      serving_size: servingSize,
      servings_per_container: servingsPerContainer ? parseInt(servingsPerContainer, 10) : null,
      other_ingredients: otherIngredients,
      directions,
      warnings,
      claims_on_label: claims,
      category_id: selectedCategoryId,
      ingredients: validIngredients,
    };

    try {
      await addProduct.mutateAsync(formData);
      navigate(`/products?category=${encodeURIComponent(categoryName || "")}`);
    } catch (error) {
      // Error handled in hook
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Add Competitor Product</h1>
          <p className="text-muted-foreground">
            Manually add product data for Formula Fit analysis
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Product details from Amazon listing</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="asin">ASIN *</Label>
              <Input
                id="asin"
                placeholder="B0XXXXXXXXX"
                value={asin}
                onChange={(e) => setAsin(e.target.value.toUpperCase())}
                maxLength={12}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand *</Label>
              <Input
                id="brand"
                placeholder="e.g., Liquid I.V."
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Product Title *</Label>
              <Input
                id="title"
                placeholder="Full product title from Amazon"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="29.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rating">Rating (0-5)</Label>
              <Input
                id="rating"
                type="number"
                step="0.1"
                min="0"
                max="5"
                placeholder="4.5"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reviews">Reviews Count</Label>
              <Input
                id="reviews"
                type="number"
                min="0"
                placeholder="1234"
                value={reviews}
                onChange={(e) => setReviews(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Supplement Facts */}
        <Card>
          <CardHeader>
            <CardTitle>Supplement Facts</CardTitle>
            <CardDescription>Ingredients from the product label</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="servingSize">Serving Size</Label>
                <Input
                  id="servingSize"
                  placeholder="e.g., 1 stick (16g)"
                  value={servingSize}
                  onChange={(e) => setServingSize(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="servingsPerContainer">Servings Per Container</Label>
                <Input
                  id="servingsPerContainer"
                  type="number"
                  min="1"
                  placeholder="30"
                  value={servingsPerContainer}
                  onChange={(e) => setServingsPerContainer(e.target.value)}
                />
              </div>
            </div>

            {/* Ingredients Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Active Ingredients *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Ingredient
                </Button>
              </div>
              
              <div className="space-y-2">
                {ingredients.map((ing, index) => (
                  <div key={ing.id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{index + 1}.</span>
                    <Input
                      placeholder="Ingredient name"
                      value={ing.name}
                      onChange={(e) => updateIngredient(ing.id, "name", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Amount"
                      value={ing.amount}
                      onChange={(e) => updateIngredient(ing.id, "amount", e.target.value)}
                      className="w-24"
                    />
                    <Select
                      value={ing.unit}
                      onValueChange={(v) => updateIngredient(ing.id, "unit", v)}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mg">mg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="mcg">mcg</SelectItem>
                        <SelectItem value="IU">IU</SelectItem>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="%">%</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="% DV"
                      value={ing.daily_value}
                      onChange={(e) => updateIngredient(ing.id, "daily_value", e.target.value)}
                      className="w-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeIngredient(ing.id)}
                      disabled={ingredients.length === 1}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="otherIngredients">Other Ingredients</Label>
              <Textarea
                id="otherIngredients"
                placeholder="Citric acid, natural flavors, stevia leaf extract..."
                value={otherIngredients}
                onChange={(e) => setOtherIngredients(e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Claims & Additional Info */}
        <Card>
          <CardHeader>
            <CardTitle>Claims & Additional Info</CardTitle>
            <CardDescription>Label claims, directions, and warnings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Claims on Label</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Non-GMO, Gluten Free, Keto Friendly"
                  value={claimInput}
                  onChange={(e) => setClaimInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addClaim();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addClaim}>
                  Add
                </Button>
              </div>
              {claims.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {claims.map((claim) => (
                    <Badge
                      key={claim}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeClaim(claim)}
                    >
                      {claim}
                      <span className="ml-1 text-muted-foreground">×</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="directions">Directions</Label>
              <Textarea
                id="directions"
                placeholder="Mix one stick with 16 oz of water..."
                value={directions}
                onChange={(e) => setDirections(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="warnings">Warnings</Label>
              <Textarea
                id="warnings"
                placeholder="Consult a physician before use if pregnant..."
                value={warnings}
                onChange={(e) => setWarnings(e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={addProduct.isPending}>
            {addProduct.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Product
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
