/**
 * Label evidence (migration 013) — typed, defensive readers for the jsonb
 * columns scout/migrate-ocr-to-dash.js and scout/verify-certifications.js
 * write on `products`:
 *   label_facts, label_sources, label_conflicts, label_product_match,
 *   certifications_verified.
 * The columns are not in the generated Supabase types until the migration is
 * applied and types regenerated, so everything is read from the untyped row.
 */

export type Basis = "per_serving" | "per_unit" | "per_day" | "per_container";
export type ElementalBasis = "stated" | "computed" | "unknown" | "model_claimed";

export interface SourceRef {
  row_id: number | string | null;
  image_url: string | null;
  image_index: number | null;
  processed_at?: string | null;
  rule?: string;
}

export interface LabelFactRow {
  name: string;
  nutrient?: string;
  amount_mg: number | null;
  amount_raw: string | null;
  unit_basis?: string | null;
  basis: Basis | null;
  basis_source?: string | null;
  per_unit_mg: number | null;
  per_serving_mg?: number | null;
  amount_kind: string | null;
  form?: string | null;
  compound: string | null;
  compound_source?: "label" | "model_claimed" | null;
  compounds?: Array<{ name: string; mg: number | null }> | null;
  elemental_mg: number | null;
  elemental_basis: ElementalBasis | null;
  elemental_factor?: number | null;
  extract: {
    ratio: string | null;
    extract_mg: number | null;
    equivalent_whole_plant_mg: number | null;
    equivalent_basis: string | null;
    standardised_to: string | null;
    note?: string | null;
    model_claimed?: string[] | null;
  } | null;
  dv_percent?: string | null;
  status?: string;
  source: SourceRef & { asin?: string | null; excerpt: string | null; excerpt_source: string | null };
}

export interface LabelFacts {
  schema_version: number;
  serving: { raw: string | null; units: number | null; form: string | null; servings_per_container?: number | null };
  rows: LabelFactRow[];
  warnings: string[];
}

export interface LabelSources {
  nutrients?: SourceRef;
  serving_size?: SourceRef;
  servings_per_container?: SourceRef;
  other_ingredients?: SourceRef;
  certifications?: Array<{ claim: string; sources: SourceRef[] }>;
  excluded?: Array<SourceRef & { why: string }>;
}

export type ConflictValue = SourceRef & { value: string | null; amount_mg?: number | null; note?: string | null };
export type LabelConflicts = Record<string, ConflictValue[]>;

export interface LabelProductMatch {
  verdict: "match" | "match_by_serving" | "mismatch" | "unknown";
  why: string;
  mismatch_on?: string[];
  count_match?: boolean | null;
  flavor_match?: boolean | null;
  brand_match?: boolean | null;
  title_tokens_overlap?: number | null;
  parent_asin?: string | null;
}

export type CertStatus = "verified" | "not_found" | "registry_unavailable" | "no_registry" | "not_checked";
export interface CertResult {
  claim: string;
  claim_key: string | null;
  registry: string | null;
  scope: string | null;
  status: CertStatus;
  checked_at: string;
  evidence_url: string | null;
  match: { company: string | null; product: string | null; quality: string } | null;
  reason: string | null;
}
export interface CertificationsVerified {
  schema_version: number;
  checked_at: string;
  lookups_enabled: boolean;
  results: CertResult[];
}

export interface LabelEvidence {
  facts: LabelFacts | null;
  sources: LabelSources | null;
  conflicts: LabelConflicts;
  match: LabelProductMatch | null;
  certifications: CertificationsVerified | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function readLabelEvidence(product: unknown): LabelEvidence | null {
  if (!isObj(product)) return null;
  const facts = isObj(product.label_facts) && Array.isArray(product.label_facts.rows) ? (product.label_facts as unknown as LabelFacts) : null;
  const sources = isObj(product.label_sources) ? (product.label_sources as LabelSources) : null;
  const conflicts = isObj(product.label_conflicts) ? (product.label_conflicts as LabelConflicts) : {};
  const match = isObj(product.label_product_match) && typeof product.label_product_match.verdict === "string" ? (product.label_product_match as unknown as LabelProductMatch) : null;
  const certifications = isObj(product.certifications_verified) && Array.isArray(product.certifications_verified.results)
    ? (product.certifications_verified as unknown as CertificationsVerified)
    : null;
  if (!facts && !sources && !match && !certifications && !Object.keys(conflicts).length) return null;
  return { facts, sources, conflicts, match, certifications };
}

/** Same normalisation as scout/utils/label-facts.js nutrientKey(). */
export function nutrientKey(name: string): string {
  return String(name || "")
    .replace(/[®™*†‡]+/g, "")
    .split("(")[0]
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The conflict entry for a nutrient row (keyed by the chosen panel row's normalised name). */
export function conflictFor(conflicts: LabelConflicts, name: string): ConflictValue[] | null {
  const k = nutrientKey(name);
  return k ? conflicts[`nutrient:${k}`] ?? null : null;
}

export function formatMg(mg: number | null | undefined): string {
  if (mg == null || !Number.isFinite(mg)) return "–";
  if (mg >= 1000) return `${+(mg / 1000).toFixed(2)} g`;
  if (mg >= 1) return `${+mg.toFixed(2)} mg`;
  return `${+(mg * 1000).toFixed(2)} mcg`;
}

export const BASIS_LABEL: Record<Basis, string> = {
  per_serving: "per serving",
  per_unit: "per unit",
  per_day: "per day",
  per_container: "per container",
};

export const AMOUNT_KIND_LABEL: Record<string, string> = {
  elemental: "elemental",
  compound_weight: "compound weight",
  extract_weight: "extract weight",
  whole_plant_equivalent: "whole-plant equivalent",
  extract_declared: "extract (declared)",
  ingredient: "ingredient",
};

export const CERT_STATUS_LABEL: Record<CertStatus, string> = {
  verified: "Verified",
  not_found: "Not found",
  registry_unavailable: "Registry unavailable",
  no_registry: "No registry",
  not_checked: "Not checked",
};

/** Human label for a label_conflicts key. */
export function conflictFieldLabel(field: string): string {
  if (field.startsWith("nutrient:")) return field.slice("nutrient:".length);
  return field.replace(/_/g, " ");
}

export function isTextSource(ref: { image_index?: number | null } | null | undefined): boolean {
  return !!ref && ref.image_index === 99;
}
