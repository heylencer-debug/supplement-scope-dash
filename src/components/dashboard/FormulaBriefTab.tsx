/**
 * FormulaBriefTab — P8 Formula Brief
 * Displays the full Dovive formula specification from formula_briefs table.
 * All sections: Executive Summary, Master Formula, Supplement Facts,
 * Physical Specs, Variants, Certifications, Pricing, Risk Factors.
 */

import { useFormulaBrief, type IngredientRow } from "@/hooks/useFormulaBrief";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FlaskConical, Target, ShieldCheck, Package, DollarSign, AlertTriangle, Zap, Star, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { categoryId: string; categoryName?: string; }

function SectionCard({ icon: Icon, title, description, children, accent }: {
  icon: any; title: string; description?: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <Card className={cn("border-slate-700/40", accent)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-200">
          <Icon className="h-4 w-4 text-indigo-400" />{title}
        </CardTitle>
        {description && <CardDescription className="text-xs text-slate-500">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function IngredientTable({ rows, title, color }: { rows: IngredientRow[]; title: string; color: string }) {
  if (!rows?.length) return null;
  return (
    <div className="mb-6">
      <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", color)}>{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-slate-700/30">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700/40 bg-slate-800/40">
              <th className="text-left py-2 px-3 text-slate-400 font-medium">Ingredient</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">Amount</th>
              <th className="text-left py-2 px-3 text-slate-400 font-medium hidden md:table-cell">Form / Spec</th>
              <th className="text-left py-2 px-3 text-slate-400 font-medium hidden lg:table-cell">Function</th>
              <th className="text-left py-2 px-3 text-slate-400 font-medium hidden xl:table-cell">Rationale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-800/20">
                <td className="py-2 px-3 font-medium text-slate-200">{r.ingredient}</td>
                <td className="py-2 px-3 text-right font-mono font-bold text-indigo-300 whitespace-nowrap">
                  {r.amount_mg ? `${r.amount_mg}mg` : r.amount_mcg ? `${r.amount_mcg}mcg` : r.amount_iu ? `${r.amount_iu}IU` : "—"}
                  {r.dv_percent && <span className="text-slate-500 font-normal ml-1">({r.dv_percent})</span>}
                  {r.elemental_mg && <span className="block text-[10px] text-slate-500">{r.elemental_mg}mg elemental</span>}
                </td>
                <td className="py-2 px-3 text-slate-400 hidden md:table-cell max-w-[180px]">{r.form || "—"}</td>
                <td className="py-2 px-3 text-slate-400 hidden lg:table-cell max-w-[200px]">{r.function || "—"}</td>
                <td className="py-2 px-3 text-slate-500 hidden xl:table-cell max-w-[200px] italic text-[11px]">{r.rationale || r.supplier || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FormulaBriefTab({ categoryId, categoryName }: Props) {
  const { data: brief, isLoading, error } = useFormulaBrief(categoryId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-400 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
        <AlertCircle className="h-4 w-4 shrink-0" />Failed to load formula brief
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="text-center py-16 space-y-3">
        <FlaskConical className="h-12 w-12 text-slate-600 mx-auto" />
        <p className="text-slate-400 font-medium">No formula brief yet for {categoryName}</p>
        <p className="text-slate-500 text-sm">Run the full P1–P7 pipeline, then generate a P8 brief.</p>
      </div>
    );
  }

  const f = brief.ingredients;
  const mf = f?.master_formula_per_serving;
  const fs = mf?.formula_summary;

  return (
    <div className="space-y-6">

      {/* Header banner */}
      <div className="p-4 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 to-violet-500/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-100">DOVIVE Formula Brief</h2>
            <p className="text-sm text-slate-400 mt-0.5">{categoryName} · v1.0 · Generated March 10, 2026</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(brief.certifications || []).slice(0, 5).map(c => (
              <Badge key={c} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{c}</Badge>
            ))}
          </div>
        </div>
        <p className="text-sm text-slate-300 mt-3">{brief.positioning}</p>
      </div>

      {/* Executive Summary */}
      <SectionCard icon={Target} title="Executive Summary" description="Product overview and key differentiators vs #1 market leader">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Product Specs</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Form</span><span className="text-slate-200 capitalize">{brief.form_type || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Serving</span><span className="text-slate-200">{mf?.serving_size || "2 gummies"}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Servings</span><span className="text-slate-200">{brief.servings_per_container}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Total Count</span><span className="text-slate-200">{mf?.total_count || 90}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Target MSRP</span><span className="text-indigo-300 font-bold">${brief.target_price}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Flavor</span><span className="text-slate-200 truncate max-w-[140px]">{brief.flavor_profile?.split('/')[0]?.trim()}</span></div>
            </div>
          </div>
          <div className="md:col-span-2 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Key Differentiators vs #1 (Goli BSR 420)</p>
            <div className="space-y-1.5">
              {(brief.key_differentiators || []).map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ChevronRight className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-300">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Master Formula */}
      <SectionCard icon={FlaskConical} title="Master Formula (Per 2-Gummy Serving)" description="Complete ingredient specification for contract manufacturer">
        {mf && <>
          <IngredientTable rows={mf.primary_actives || []} title="Primary Active Ingredients" color="text-indigo-400" />
          <IngredientTable rows={mf.secondary_actives || []} title="Secondary Active Ingredients" color="text-violet-400" />
          <IngredientTable rows={mf.tertiary_actives || []} title="Tertiary Actives (Differentiation)" color="text-amber-400" />
          <IngredientTable rows={mf.excipients || []} title="Functional Excipients (Gummy Base)" color="text-slate-400" />

          {/* Formula Summary */}
          {fs && (
            <div className="mt-4 rounded-lg border border-slate-700/40 overflow-hidden">
              <div className="px-3 py-2 bg-slate-800/40 border-b border-slate-700/30">
                <p className="text-xs font-semibold text-slate-300">Formula Weight Summary</p>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    { label: "Primary Actives", mg: fs.primary_mg, color: "text-indigo-400" },
                    { label: "Secondary Actives", mg: fs.secondary_mg, color: "text-violet-400" },
                    { label: "Tertiary Actives", mg: fs.tertiary_mg, color: "text-amber-400" },
                    { label: "Functional Excipients", mg: fs.excipients_mg, color: "text-slate-400" },
                  ].map(r => (
                    <tr key={r.label} className="border-b border-slate-700/20">
                      <td className={cn("py-2 px-3", r.color)}>{r.label}</td>
                      <td className="py-2 px-3 text-right text-slate-300 font-mono">{r.mg}mg</td>
                      <td className="py-2 px-3 text-right text-slate-500">{Math.round(r.mg / fs.total_mg * 100)}%</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-800/30 font-bold">
                    <td className="py-2 px-3 text-slate-200">TOTAL per Serving (2 gummies)</td>
                    <td className="py-2 px-3 text-right text-slate-100 font-mono">{fs.total_mg}mg (~{(fs.total_mg/1000).toFixed(2)}g)</td>
                    <td className="py-2 px-3 text-right text-slate-300">100%</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-slate-400">Per gummy unit</td>
                    <td className="py-2 px-3 text-right text-slate-400 font-mono">{fs.per_gummy_mg}mg</td>
                    <td className="py-2 px-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Synergies */}
          {f?.synergies && f.synergies.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
              <p className="text-xs font-semibold text-indigo-400 mb-2">⚡ Synergistic Combinations</p>
              <div className="space-y-1">
                {f.synergies.map((s, i) => <p key={i} className="text-xs text-slate-400">{s}</p>)}
              </div>
            </div>
          )}
        </>}
      </SectionCard>

      {/* Supplement Facts Panel */}
      {f?.supplement_facts && (
        <SectionCard icon={FlaskConical} title="Supplement Facts Panel" description="Print-ready format for label">
          <div className="font-mono text-xs bg-white text-black p-4 rounded-lg border-2 border-black max-w-sm">
            <div className="border-b-8 border-black pb-1 mb-2">
              <p className="text-xl font-black">Supplement Facts</p>
            </div>
            <div className="text-[11px] space-y-0.5">
              {f.supplement_facts.split('|').map((line, i) => (
                <p key={i} className={i === 0 || i === 1 ? "font-bold" : ""}>{line.trim()}</p>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {f.directions && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Directions for Use</p>
                <p className="text-sm text-slate-300">{f.directions}</p>
              </div>
            )}
            {f.warnings && (
              <div>
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">Warnings</p>
                <p className="text-sm text-slate-400">{f.warnings}</p>
              </div>
            )}
            {f.claims && f.claims.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Structure/Function Claims</p>
                <div className="space-y-1">
                  {f.claims.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <Star className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-slate-300 italic">{c}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">*Requires 30-day FDA notification per 21 CFR 101.93 prior to use</p>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Consumer Pain Points + Formulation Rationale */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {brief.consumer_pain_points?.length > 0 && (
          <SectionCard icon={AlertCircle} title="Pain Points Solved" description="Consumer complaints this formula addresses">
            <div className="space-y-2">
              {brief.consumer_pain_points.map((p: any, i: number) => (
                <div key={i} className="p-2.5 rounded-lg border border-slate-700/30 bg-slate-800/20">
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 text-xs mt-0.5">✗</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-300">{p.complaint}</p>
                      <div className="flex items-start gap-1.5 mt-1">
                        <span className="text-emerald-400 text-xs mt-0.5">✓</span>
                        <p className="text-xs text-emerald-300">{p.solution}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {brief.opportunity_insights && (
          <SectionCard icon={Zap} title="Market Opportunity" description="Gaps this formula is designed to fill">
            <div className="space-y-2">
              {(brief.opportunity_insights.gaps || []).map((g: string, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                  <span className="text-emerald-400 text-xs mt-0.5">→</span>
                  <p className="text-xs text-emerald-300">{g}</p>
                </div>
              ))}
              {brief.opportunity_insights.strategy && (
                <div className="mt-3 p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                  <p className="text-xs text-indigo-200">{brief.opportunity_insights.strategy}</p>
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </div>

      {/* Variant Lineup */}
      {f?.variants && f.variants.length > 0 && (
        <SectionCard icon={Package} title="Variant Lineup (3 SKUs)" description="Product line recommendation based on category gaps">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {f.variants.map((v, i) => (
              <div key={i} className={cn(
                "p-3 rounded-xl border",
                i === 0 ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-700/40 bg-slate-800/20"
              )}>
                {i === 0 && <Badge className="mb-2 text-[10px] bg-indigo-500/20 text-indigo-300 border-indigo-500/30">Hero SKU</Badge>}
                <p className="text-sm font-bold text-slate-200">{v.name}</p>
                <p className="text-xs text-slate-400 mt-1">🍓 {v.flavor}</p>
                <p className="text-xs text-slate-500 mt-1">Target: {v.target}</p>
                <div className="mt-2 pt-2 border-t border-slate-700/30">
                  <p className="text-[10px] font-semibold text-amber-400 uppercase">Formula Change</p>
                  <p className="text-xs text-slate-400 mt-0.5">{v.changes}</p>
                  <p className="text-[10px] text-slate-500 mt-1 italic">{v.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Physical Specs + Stability */}
      {(f?.physical || f?.stability) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {f.physical && (
            <SectionCard icon={Package} title="Physical Specifications">
              <div className="space-y-1.5">
                {Object.entries(f.physical).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1 border-b border-slate-700/20 last:border-0">
                    <span className="text-xs text-slate-400 capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-slate-300 font-medium text-right max-w-[180px]">{String(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-1">
                  <span className="text-xs text-slate-400">Packaging</span>
                  <span className="text-xs text-slate-300 text-right max-w-[180px] truncate">{brief.packaging_type}</span>
                </div>
              </div>
            </SectionCard>
          )}

          {f.stability && (
            <SectionCard icon={FlaskConical} title="Stability & Overage">
              <p className="text-xs text-slate-400 mb-3">Target shelf life: <span className="text-slate-200 font-medium">{f.stability.shelf_months} months</span> at ≤25°C / 60% RH</p>
              {f.stability.overages && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/40">
                      <th className="text-left py-1 text-slate-500">Ingredient</th>
                      <th className="text-right py-1 text-slate-500">Label</th>
                      <th className="text-right py-1 text-slate-500">+Overage</th>
                      <th className="text-right py-1 text-slate-500">Mfg Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.stability.overages.map((o, i) => (
                      <tr key={i} className="border-b border-slate-700/20">
                        <td className="py-1.5 text-slate-300">{o.name}</td>
                        <td className="py-1.5 text-right text-slate-400 font-mono">{o.label ? `${o.label}mg` : `${o.label_mcg}mcg`}</td>
                        <td className="py-1.5 text-right text-amber-400">+{o.overage_pct}%</td>
                        <td className="py-1.5 text-right text-indigo-300 font-mono font-bold">{o.target ? `${o.target}mg` : `${o.target_mcg}mcg`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {/* Pricing + Certifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {f?.pricing && f.pricing.length > 0 && (
          <SectionCard icon={DollarSign} title="Target Pricing" description="Suggested MSRP lineup">
            <div className="space-y-2">
              {f.pricing.map((p, i) => (
                <div key={i} className={cn("p-3 rounded-lg border flex items-center justify-between", i === 0 ? "border-indigo-500/30 bg-indigo-500/10" : "border-slate-700/30 bg-slate-800/20")}>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{p.format}</p>
                    <p className="text-xs text-slate-500 mt-0.5">${p.per_sv.toFixed(2)}/serving</p>
                  </div>
                  {p.msrp && <span className="text-lg font-bold text-indigo-300">${p.msrp}</span>}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        <SectionCard icon={ShieldCheck} title="Certifications & Testing">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Dietary Claims</p>
              <div className="flex flex-wrap gap-1.5">
                {(brief.certifications || []).map(c => (
                  <Badge key={c} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{c}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Testing Requirements</p>
              <div className="space-y-1">
                {(brief.testing_requirements || []).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Risk Factors */}
      {(brief.risk_factors?.length || brief.regulatory_notes) && (
        <SectionCard icon={AlertTriangle} title="Risks & Regulatory Notes" accent="border-amber-500/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brief.risk_factors && brief.risk_factors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Risk Factors</p>
                <div className="space-y-1.5">
                  {brief.risk_factors.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                      <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {brief.regulatory_notes && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Regulatory Notes</p>
                <p className="text-xs text-slate-400">{brief.regulatory_notes}</p>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Footer */}
      <div className="text-center py-4 border-t border-slate-700/30">
        <p className="text-xs text-slate-500">
          Formula Brief v1.0 · Generated by Scout AI · {brief.category_id} ·{" "}
          <span className="text-slate-400">For CMO use only — Confidential</span>
        </p>
      </div>
    </div>
  );
}
