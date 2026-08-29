/**
 * products.claims is stored as a JSON-stringified array (e.g.
 * '["Keto","Kosher","Vegan","Sugar Free","Amazon\'s Choice"]'), not a plain
 * comma-separated string. Naively splitting that string on "," leaves stray
 * JSON syntax on the first/last claim of every product ('["Sugar Free"]',
 * '"Natural"') rendered as literal text. Parse real JSON first; fall back to
 * comma-split only for legacy plain-string rows.
 */
export function parseClaimsList(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.trim())
          .filter(Boolean);
      }
    } catch {
      // Not valid JSON despite the leading '[' — fall through to comma-split.
    }
  }
  return trimmed.split(/[,;]/).map((c) => c.trim()).filter(Boolean);
}
