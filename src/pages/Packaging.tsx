import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import { useProducts } from "@/hooks/useProducts";
import { useFormulaBriefVersions } from "@/hooks/useFormulaBriefVersions";
import { PackagingIntelligence } from "@/components/dashboard/PackagingIntelligence";
import { ScoutPackagingIntelligence } from "@/components/dashboard/ScoutPackagingIntelligence";

export default function Packaging() {
  const [searchParams] = useSearchParams();
  const rawUrl = searchParams.get("category");
  const urlCategoryName = rawUrl ? rawUrl.replace(/^=+/, "").trim() : null;
  const { setCategoryContext, categoryName: contextCategoryName } = useCategoryContext();

  const categoryName = urlCategoryName || contextCategoryName;

  const { data: category, isLoading: categoryLoading } = useCategoryByName(categoryName || undefined);
  const { data: analysis, isLoading: analysisLoading } = useCategoryAnalysis(category?.id);
  const { data: products } = useProducts(category?.id);
  const { versions, activeVersion } = useFormulaBriefVersions(category?.id);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  useEffect(() => {
    if (activeVersion && !selectedVersionId) setSelectedVersionId(activeVersion.id);
  }, [activeVersion, selectedVersionId]);

  useEffect(() => {
    if (category) setCategoryContext(category.id, category.name);
    else if (categoryName && !category && !categoryLoading) setCategoryContext(null, categoryName);
  }, [category, categoryName, categoryLoading, setCategoryContext]);

  const formulaVersionId = selectedVersionId || null;
  const selectedVersion = selectedVersionId ? versions.find((v) => v.id === selectedVersionId) : undefined;
  const hasAnalysis = !!analysis;

  const packagingData = (() => {
    const a1 = analysis?.analysis_1_category_scores as Record<string, unknown> | null;
    const pd = a1?.product_development as Record<string, unknown> | null;
    return pd?.packaging as { type?: string; quantity?: string | number; design_elements?: string[] } | null;
  })();

  const formulaBriefContent =
    activeVersion?.formula_brief_content ||
    selectedVersion?.formula_brief_content ||
    ((analysis?.analysis_3_formula_brief as Record<string, unknown> | null)?.formula_brief_content as string | null);

  if (!categoryName) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a category from New Analysis to view packaging intelligence.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <PackagingIntelligence
        packagingData={packagingData}
        productsClaims={products?.map((p) => p.claims) || []}
        productsData={
          products?.map((p) => ({
            packaging_type: p.packaging_type,
            servings_per_container: p.servings_per_container,
            price: p.price,
            brand: p.brand,
            title: p.title,
            main_image_url: p.main_image_url,
            claims: p.claims,
            claims_on_label: p.claims_on_label,
            monthly_revenue: p.monthly_revenue,
            monthly_sales: p.monthly_sales,
            marketing_analysis: p.marketing_analysis as {
              design_blueprint?: {
                trust_signals?: string;
                color_strategy?: string;
                visual_style?: string;
                conversion_triggers?: string;
              };
            } | null,
          })) || []
        }
        isLoading={analysisLoading && !hasAnalysis}
        categoryId={category?.id}
        formulaVersionId={formulaVersionId}
        versionInfo={
          selectedVersion
            ? {
                versionNumber: selectedVersion.version_number,
                isActive: selectedVersion.is_active,
                changeSummary: selectedVersion.change_summary,
              }
            : undefined
        }
        formulaBriefContent={formulaBriefContent ?? null}
      />

      {category?.id && (
        <ScoutPackagingIntelligence categoryId={category.id} />
      )}
    </div>
  );
}
