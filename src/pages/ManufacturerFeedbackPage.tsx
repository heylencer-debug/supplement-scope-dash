import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { Factory } from "lucide-react";
import { ManufacturerFeedback } from "@/components/document/ManufacturerFeedback";

export default function ManufacturerFeedbackPage() {
  const [searchParams] = useSearchParams();
  const rawUrlCategoryName = searchParams.get("category");
  const urlCategoryName = rawUrlCategoryName ? rawUrlCategoryName.replace(/^=+/, "").trim() : null;

  const { currentCategoryId, categoryName: contextCategoryName, setCategoryContext } = useCategoryContext();
  const categoryName = urlCategoryName || contextCategoryName;

  const { data: categoryFromName } = useCategoryByName(
    categoryName && !currentCategoryId ? categoryName : undefined
  );

  useEffect(() => {
    if (categoryFromName && !currentCategoryId) {
      setCategoryContext(categoryFromName.id, categoryFromName.name);
    }
  }, [categoryFromName, currentCategoryId, setCategoryContext]);

  const effectiveCategoryId = currentCategoryId || categoryFromName?.id;

  if (!categoryName || !effectiveCategoryId) {
    return (
      <div className="max-w-2xl mx-auto py-20 flex flex-col items-center justify-center space-y-6 text-center">
        <div className="p-4 rounded-full bg-primary/10">
          <Factory className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Manufacturer Feedback</h1>
        <p className="text-muted-foreground text-lg">
          Select a category first to submit and review manufacturer feedback.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Factory className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Manufacturer Feedback</h1>
          <p className="text-sm text-muted-foreground">{categoryName}</p>
        </div>
      </div>
      <ManufacturerFeedback
        categoryId={effectiveCategoryId}
        keyword={categoryName}
        defaultExpanded
      />
    </div>
  );
}
