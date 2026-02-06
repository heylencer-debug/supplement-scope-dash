import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, ArrowLeft, Save, Loader2, Upload, Sparkles, X, ImageIcon, Search } from "lucide-react";
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
import { useExtractSupplementImage } from "@/hooks/useExtractSupplementImage";
import { useEnrichProduct, EnrichedProductData } from "@/hooks/useEnrichProduct";
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
  const extractImage = useExtractSupplementImage();
  const enrichProduct = useEnrichProduct();
  
  const effectiveCategoryId = currentCategoryId || categoryFromName?.id || "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enrichment state
  const [enrichedData, setEnrichedData] = useState<EnrichedProductData | null>(null);
  const [enrichSource, setEnrichSource] = useState<string | null>(null);

  // Form state
  const [asin, setAsin] = useState("");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");
  const [rating, setRating] = useState("");
  const [reviews, setReviews] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(effectiveCategoryId);

  // Auto-select category when loaded from URL
  useEffect(() => {
    if (effectiveCategoryId && !selectedCategoryId) {
      setSelectedCategoryId(effectiveCategoryId);
    }
  }, [effectiveCategoryId, selectedCategoryId]);
  
  // Supplement facts state
  const [servingSize, setServingSize] = useState("");
  const [servingsPerContainer, setServingsPerContainer] = useState("");
  const [otherIngredients, setOtherIngredients] = useState("");
  const [directions, setDirections] = useState("");
  const [warnings, setWarnings] = useState("");
  const [claimInput, setClaimInput] = useState("");
  const [claims, setClaims] = useState<string[]>([]);
  
  // Image upload state
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  
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

  // Image upload handlers
  const handleFileSelect = useCallback((file: File) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPEG, PNG, or WebP image",
        variant: "destructive",
      });
      return;
    }

    setUploadedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const clearImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExtractFromImage = async () => {
    if (!uploadedImage) return;

    try {
      const result = await extractImage.mutateAsync(uploadedImage);
      
      // Auto-populate form fields
      if (result.data.serving_size) {
        setServingSize(result.data.serving_size);
      }
      if (result.data.servings_per_container) {
        setServingsPerContainer(String(result.data.servings_per_container));
      }
      if (result.data.other_ingredients) {
        setOtherIngredients(result.data.other_ingredients);
      }
      if (result.data.directions) {
        setDirections(result.data.directions);
      }
      if (result.data.warnings) {
        setWarnings(result.data.warnings);
      }
      if (result.data.claims_on_label?.length) {
        setClaims(prev => [...new Set([...prev, ...result.data.claims_on_label])]);
      }
      
      // Replace ingredients with extracted ones
      if (result.data.ingredients?.length) {
        const newIngredients = result.data.ingredients.map(ing => ({
          id: crypto.randomUUID(),
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          daily_value: ing.daily_value?.replace("%", "") || "",
        }));
        setIngredients(newIngredients);
      }

      toast({
        title: "Extraction Complete",
        description: `Extracted ${result.data.ingredients?.length || 0} ingredients with ${result.confidence} confidence`,
      });
      
      if (result.extraction_notes) {
        console.log("Extraction notes:", result.extraction_notes);
      }
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleAsinLookup = async () => {
    if (!asin || asin.length < 10) {
      toast({
        title: "Invalid ASIN",
        description: "Please enter a valid ASIN (10+ characters)",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await enrichProduct.mutateAsync(asin);
      const d = result.data;
      setEnrichedData(d);
      setEnrichSource(result.source === "both" ? "Jungle Scout + Keepa" : result.source === "jungle_scout" ? "Jungle Scout" : "Keepa");

      // Auto-fill form fields (only if currently empty)
      if (d.title && !title) setTitle(d.title);
      if (d.brand && !brand) setBrand(d.brand);
      if (d.price != null && !price) setPrice(String(d.price));
      if (d.rating != null && !rating) setRating(String(d.rating));
      if (d.reviews != null && !reviews) setReviews(String(d.reviews));
    } catch (error) {
      // Error handled in hook
    }
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
      // Pass through enrichment data
      ...(enrichedData ? {
        monthly_sales: enrichedData.monthly_sales,
        monthly_revenue: enrichedData.monthly_revenue,
        bsr_current: enrichedData.bsr_current,
        bsr_category: enrichedData.bsr_category,
        lqs: enrichedData.lqs,
        seller_name: enrichedData.seller_name,
        seller_type: enrichedData.seller_type,
        is_fba: enrichedData.is_fba,
        date_first_available: enrichedData.date_first_available,
        main_image_url: enrichedData.main_image_url,
        image_urls: enrichedData.image_urls,
        product_url: enrichedData.product_url,
        feature_bullets: enrichedData.feature_bullets,
        dimensions: enrichedData.dimensions,
        weight: enrichedData.weight,
        price_30_days_avg: enrichedData.price_30_days_avg,
        price_90_days_avg: enrichedData.price_90_days_avg,
        bsr_30_days_avg: enrichedData.bsr_30_days_avg,
        bsr_90_days_avg: enrichedData.bsr_90_days_avg,
        estimated_revenue: enrichedData.estimated_revenue,
        estimated_monthly_sales: enrichedData.estimated_monthly_sales,
        fees_estimate: enrichedData.fees_estimate,
        variations_count: enrichedData.variations_count,
        parent_asin: enrichedData.parent_asin,
      } : {}),
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
              <div className="flex gap-2">
                <Input
                  id="asin"
                  placeholder="B0XXXXXXXXX"
                  value={asin}
                  onChange={(e) => setAsin(e.target.value.toUpperCase())}
                  maxLength={12}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAsinLookup}
                  disabled={enrichProduct.isPending || asin.length < 10}
                  className="gap-1.5 shrink-0"
                >
                  {enrichProduct.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Lookup
                </Button>
              </div>
              {enrichSource && (
                <Badge variant="secondary" className="text-xs">
                  ✓ {enrichSource}
                </Badge>
              )}
            </div>
            {/* Enriched product image preview */}
            {enrichedData?.main_image_url && (
              <div className="flex items-center justify-center">
                <img
                  src={enrichedData.main_image_url}
                  alt="Product"
                  className="h-24 w-24 rounded-lg object-contain border border-border"
                />
              </div>
            )}
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
            <CardDescription>Upload an image or manually enter ingredients from the product label</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Image Upload Section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Upload Supplement Facts Image
              </Label>
              
              <div
                className={`relative border-2 border-dashed rounded-xl p-6 transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
                
                {!imagePreview ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        Drop supplement facts image here or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports JPEG, PNG, WebP (max 10MB)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Supplement facts preview"
                        className="h-32 w-auto rounded-lg object-contain border border-border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearImage();
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-medium truncate">{uploadedImage?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {uploadedImage && `${(uploadedImage.size / 1024).toFixed(1)} KB`}
                      </p>
                      <Button
                        type="button"
                        onClick={handleExtractFromImage}
                        disabled={extractImage.isPending}
                        className="gap-2"
                      >
                        {extractImage.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Analyze with AI
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or enter manually</span>
              </div>
            </div>
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
