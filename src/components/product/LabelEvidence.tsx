/**
 * LabelEvidence — "where did each label fact come from, and does it hold up?"
 * Product modal → Formula (Scout). Pure presentation over the migration-013
 * columns (see src/lib/labelEvidence.ts):
 *   - does this label belong to this listing and variation (verdict + why);
 *   - nutrient table with basis, per-unit, elemental vs compound, extract vs
 *     whole-plant equivalent, a source thumbnail/excerpt per row and a
 *     conflict badge where sources disagree;
 *   - every recorded conflict, value by value, each with its source;
 *   - certification claims with the registry's answer, not the logo's.
 */
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  AMOUNT_KIND_LABEL,
  BASIS_LABEL,
  CERT_STATUS_LABEL,
  conflictFieldLabel,
  conflictFor,
  formatMg,
  isTextSource,
  type CertStatus,
  type LabelEvidence as LabelEvidenceData,
  type LabelFactRow,
  type SourceRef,
} from "@/lib/labelEvidence";

const VERDICT_STYLE = {
  match: "border-chart-4/40 text-chart-4",
  match_by_serving: "border-chart-2/50 text-chart-2",
  mismatch: "border-destructive/50 text-destructive",
  unknown: "border-border text-muted-foreground",
} as const;

const CERT_STYLE: Record<CertStatus, string> = {
  verified: "border-chart-4/40 text-chart-4",
  not_found: "border-destructive/50 text-destructive",
  registry_unavailable: "border-chart-2/50 text-chart-2",
  not_checked: "border-border text-muted-foreground",
  no_registry: "border-border text-muted-foreground",
};

function SourceCell({ source }: { source: LabelFactRow["source"] }) {
  const title = source.excerpt ? `“${source.excerpt}”${source.excerpt_source === "model_unverified" ? " (not found in the label text)" : ""}` : undefined;
  if (isTextSource(source) || !source.image_url) {
    return <span className="text-[11px] text-muted-foreground" title={title}>Listing text</span>;
  }
  return (
    <a href={source.image_url} target="_blank" rel="noreferrer" title={title} className="inline-flex items-center gap-1.5 group">
      <img src={source.image_url} alt={`Label image ${source.image_index ?? ""}`} className="h-8 w-8 rounded object-cover border border-border/60 group-hover:border-primary" loading="lazy" />
      <span className="text-[11px] text-muted-foreground group-hover:text-primary">img {source.image_index ?? "?"}</span>
    </a>
  );
}

function SourceLink({ src }: { src: SourceRef }) {
  if (isTextSource(src) || !src.image_url) return <span className="text-muted-foreground">listing text</span>;
  return <a href={src.image_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">image {src.image_index ?? "?"}</a>;
}

function ElementalCell({ r }: { r: LabelFactRow }) {
  if (!r.elemental_basis) return <span className="text-muted-foreground">–</span>;
  if (r.elemental_basis === "unknown") return <span className="text-muted-foreground" title={r.compound ? `Compound: ${r.compound}` : undefined}>unknown</span>;
  const why = r.elemental_basis === "model_claimed"
    ? "reported by the model; not found on this row's own label line"
    : r.elemental_factor ? `computed with factor ${r.elemental_factor}` : "printed on the label";
  return (
    <span title={why}>
      {formatMg(r.elemental_mg)} <span className="text-[10px] text-muted-foreground">{r.elemental_basis}</span>
    </span>
  );
}

function ExtractCell({ r }: { r: LabelFactRow }) {
  const x = r.extract;
  if (!x) return <span className="text-muted-foreground">–</span>;
  const parts = [
    x.ratio,
    x.extract_mg != null ? `${formatMg(x.extract_mg)} extract` : null,
    x.equivalent_whole_plant_mg != null ? `≈ ${formatMg(x.equivalent_whole_plant_mg)} plant` : null,
    x.standardised_to ? `std. ${x.standardised_to}` : null,
  ].filter(Boolean);
  return <span title={x.note ?? undefined}>{parts.length ? parts.join(" · ") : "extract"}</span>;
}

export function LabelEvidence({ evidence }: { evidence: LabelEvidenceData }) {
  const { facts, sources, conflicts, match, certifications } = evidence;
  const conflictEntries = Object.entries(conflicts);
  const excluded = sources?.excluded ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {match && (
          <Badge variant="outline" className={cn("gap-1", VERDICT_STYLE[match.verdict])} title={match.why}>
            {match.verdict === "match"
              ? "Label matches this listing"
              : match.verdict === "match_by_serving"
                ? "Another pack size's label — same per serving"
                : match.verdict === "mismatch"
                  ? "Label is another product"
                  : "Label match unknown"}
          </Badge>
        )}
        {conflictEntries.length > 0 && <Badge variant="outline" className="border-chart-2/50 text-chart-2">{conflictEntries.length} source conflict{conflictEntries.length === 1 ? "" : "s"}</Badge>}
        {facts?.serving?.raw && (
          <span className="text-muted-foreground">
            Serving: {facts.serving.raw}
            {facts.serving.servings_per_container != null && ` · ${facts.serving.servings_per_container} per container`}
            {sources?.serving_size && <> · from <SourceLink src={sources.serving_size} /></>}
          </span>
        )}
      </div>
      {match && match.verdict !== "match" && <p className="text-xs text-muted-foreground -mt-3">{match.why}</p>}

      {excluded.length > 0 && (
        <div className="text-xs space-y-1">
          <p className="uppercase tracking-wide text-[10px] text-muted-foreground">Not used (brand or flavour says another product)</p>
          {excluded.map((x, i) => (
            <p key={i} className="text-muted-foreground"><SourceLink src={x} /> — {x.why}</p>
          ))}
        </div>
      )}

      {facts && facts.rows.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Ingredient</TableHead>
                <TableHead className="text-xs text-right">As printed</TableHead>
                <TableHead className="text-xs">Basis</TableHead>
                <TableHead className="text-xs text-right">Per unit</TableHead>
                <TableHead className="text-xs">Elemental</TableHead>
                <TableHead className="text-xs">Extract</TableHead>
                <TableHead className="text-xs">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facts.rows.map((r, i) => {
                const c = conflictFor(conflicts, r.name);
                return (
                  <TableRow key={i}>
                    <TableCell className="text-xs align-top">
                      <div className="font-medium text-foreground">{r.nutrient || r.name}</div>
                      {(r.compound || r.form) && <div className="text-[11px] text-muted-foreground">{r.compound || r.form}</div>}
                      {r.amount_kind && <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{AMOUNT_KIND_LABEL[r.amount_kind] ?? r.amount_kind}</div>}
                      {c && (
                        <Badge variant="outline" className="mt-1 border-chart-2/50 text-chart-2 text-[10px]" title={c.map((v) => `${v.value ?? "absent"} (${isTextSource(v) ? "listing text" : `image ${v.image_index ?? "?"}`})`).join(" vs ")}>
                          conflict
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums align-top">{r.amount_raw ?? "–"}</TableCell>
                    <TableCell className="text-xs align-top">
                      {r.basis ? BASIS_LABEL[r.basis] : <span className="text-muted-foreground">unknown</span>}
                      {r.basis_source && r.basis && <div className="text-[10px] text-muted-foreground">{r.basis_source.replace(/_/g, " ")}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums align-top">{formatMg(r.per_unit_mg)}</TableCell>
                    <TableCell className="text-xs tabular-nums align-top"><ElementalCell r={r} /></TableCell>
                    <TableCell className="text-xs align-top"><ExtractCell r={r} /></TableCell>
                    <TableCell className="text-xs align-top"><SourceCell source={r.source} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {facts.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {facts.warnings.map((w, i) => <li key={i} className="text-[11px] text-muted-foreground">• {w}</li>)}
            </ul>
          )}
        </div>
      )}

      {conflictEntries.length > 0 && (
        <div className="space-y-2">
          <p className="uppercase tracking-wide text-[10px] text-muted-foreground">Where the sources disagree</p>
          {conflictEntries.map(([field, values]) => (
            <div key={field} className="text-xs">
              <span className="font-medium text-foreground capitalize">{conflictFieldLabel(field)}</span>
              <span className="text-muted-foreground">: </span>
              {values.map((v, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-muted-foreground"> vs </span>}
                  <span className="tabular-nums">{v.value ?? v.note ?? "absent"}</span> <span className="text-muted-foreground">(<SourceLink src={v} />)</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {certifications && certifications.results.length > 0 && (
        <div className="space-y-2">
          <p className="uppercase tracking-wide text-[10px] text-muted-foreground">
            Certification claims {certifications.lookups_enabled ? "checked with the certifying organisation" : "(registry lookups were off)"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {certifications.results.map((r, i) => {
              const chip = (
                <Badge variant="outline" className={cn("gap-1 text-[11px]", CERT_STYLE[r.status])} title={[r.registry, r.reason, r.match?.product].filter(Boolean).join(" — ")}>
                  {r.claim} · {CERT_STATUS_LABEL[r.status]}
                </Badge>
              );
              return r.evidence_url ? <a key={i} href={r.evidence_url} target="_blank" rel="noreferrer">{chip}</a> : <span key={i}>{chip}</span>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
