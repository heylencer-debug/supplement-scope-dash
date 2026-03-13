/**
 * P9DoseAnalysis — Dosage analysis from P10 QA formula brief
 * DYNAMIC: reads from formula_briefs (formula_validation + adjusted_formula + flavor_qa)
 * Fully category-specific — no hardcoded ingredients.
 */

import { Pill, CheckCircle2, XCircle, AlertCircle, Loader2, FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFormulaBrief } from "@/hooks/useFormulaBrief";

interface P9DoseAnalysisProps {
  categoryId: string;
}

export function P9DoseAnalysis({ categoryId }: P9DoseAnalysisProps) {
  const { data: brief, isLoading, error } = useFormulaBrief(categoryId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading dose analysis...
      </div>
    );
  }

  if (error || !brief?.ingredients) {
    return (
      <div className="flex items-center gap-2 text-sm text-chart-2 p-4 bg-chart-2/10 rounded-xl border border-chart-2/20">
        <AlertCircle className="h-4 w-4 shrink-0" />
        No formula brief yet — run P9 + P10 for this category first
      </div>
    );
  }

  const ing = brief.ingredients;
  const validation = ing.formula_validation;
  const adjustedFormula = ing.adjusted_formula;
  const flavorQa = ing.flavor_qa;
  const keyword = ing.keyword || "this category";

  const hasErrors = validation && (validation.errors?.length > 0);
  const hasWarnings = validation && (validation.warnings?.length > 0);

  return (
    <div className="space-y-4">

      {/* Formula Validation Status */}
      {validation && (
        <Card className={`border-${validation.valid && !hasErrors ? "chart-4" : "destructive"}/30 bg-${validation.valid && !hasErrors ? "chart-4" : "destructive"}/5`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              {validation.valid && !hasErrors
                ? <CheckCircle2 className="h-4 w-4 text-chart-4" />
                : <XCircle className="h-4 w-4 text-destructive" />
              }
              Formula Validation — {keyword}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Ingredient list from validation */}
            {validation.ingredients && validation.ingredients.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Validated Ingredients</p>
                <div className="grid grid-cols-1 gap-1">
                  {validation.ingredients.map((ing, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2">
                        <Pill className="h-3 w-3 text-primary shrink-0" />
                        <span className="text-xs font-medium text-foreground capitalize">{ing.name}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{ing.raw}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {hasErrors && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wide">❌ Errors</p>
                {validation.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive bg-destructive/10 p-2 rounded">{e}</p>
                ))}
              </div>
            )}

            {/* Warnings */}
            {hasWarnings && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-chart-2 uppercase tracking-wide">⚠️ Warnings</p>
                {validation.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-chart-2 bg-chart-2/10 p-2 rounded">{w}</p>
                ))}
              </div>
            )}

            {validation.valid && !hasErrors && (
              <p className="text-xs text-chart-4 font-medium">✅ Formula validated — no critical errors</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Adjusted Formula Table */}
      {adjustedFormula && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-primary" />
              Full Ingredient Dose Specification
            </CardTitle>
            <CardDescription className="text-xs">
              P10 QA-adjusted formula — ingredient, amount, form, role, and rationale
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed bg-muted/30 p-3 rounded-lg border border-border max-h-[450px] overflow-y-auto">
                {adjustedFormula}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flavor QA */}
      {flavorQa && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Pill className="h-4 w-4 text-chart-2" />
              Flavor Intelligence
            </CardTitle>
            <CardDescription className="text-xs">Category-specific flavor analysis from P9</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 p-3 rounded-lg border border-border max-h-[300px] overflow-y-auto">
              {flavorQa}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Positioning */}
      {brief.positioning && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Recommended Positioning</p>
            <p className="text-sm text-foreground">{brief.positioning}</p>
            {brief.target_customer && (
              <p className="text-xs text-muted-foreground mt-1">Target: {brief.target_customer}</p>
            )}
            {brief.flavor_profile && (
              <p className="text-xs text-muted-foreground mt-1">Flavors: {brief.flavor_profile}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
