/**
 * Market tab card around ReviewEvidence (category scope). Reads the P3b
 * synthesis row; renders one honest line when it has not been generated yet.
 */
import { MessageSquareText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useReviewSynthesis } from "@/hooks/useReviewSynthesis";
import { ReviewEvidence } from "@/components/reviews/ReviewEvidence";

export function ReviewEvidenceCard({ categoryId, keyword }: { categoryId: string; keyword?: string | null }) {
  const { data, isLoading } = useReviewSynthesis(categoryId, keyword);
  const generated = data?.generated_at ? new Date(data.generated_at).toLocaleDateString() : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="w-5 h-5 text-primary" />
          Review evidence
        </CardTitle>
        <CardDescription>
          What customers report across every collected review, with how many reviews and products back each theme
          {generated ? ` · updated ${generated}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[160px] w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground/80">Review evidence has not been generated for this category yet (runs after the Reviews phase).</p>
        ) : (
          <ReviewEvidence
            ledger={data.ledger}
            themes={data.themes ?? []}
            domainBreakdown={data.domain_breakdown ?? []}
            scope="category"
            status={data.status}
          />
        )}
      </CardContent>
    </Card>
  );
}
