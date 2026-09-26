/**
 * Market tab card around MarketingAssetsCategory. Reads the P7b category row;
 * renders one honest line when it has not been generated yet.
 */
import { Images } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketingAssets } from "@/hooks/useMarketingAssets";
import { MarketingAssetsCategory } from "@/components/marketing-assets/MarketingAssets";

export function MarketingAssetsCard({ categoryId, keyword }: { categoryId: string; keyword?: string | null }) {
  const { data, isLoading } = useMarketingAssets(categoryId, keyword);
  const generated = data?.generated_at ? new Date(data.generated_at).toLocaleDateString() : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Images className="w-5 h-5 text-primary" />
          Marketing assets
        </CardTitle>
        <CardDescription>
          What competitors' listing images and A+ content actually say, counted per product, and which claimed benefits customers experience
          {generated ? ` · updated ${generated}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[160px] w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground/80">Marketing assets have not been analysed for this category yet (runs after the OCR phase).</p>
        ) : (
          <MarketingAssetsCategory row={data} />
        )}
      </CardContent>
    </Card>
  );
}
