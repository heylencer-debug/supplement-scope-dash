/**
 * Extracts ALL flavor information from formula brief markdown content.
 * Returns an array of flavor strings found in the document.
 */
export function extractFlavorsFromFormulaBrief(content: string | null | undefined): string[] {
  if (!content) return [];

  const flavors: string[] = [];
  const seen = new Set<string>();

  const addFlavor = (f: string) => {
    const cleaned = f.trim().replace(/[|*_`]/g, '').trim();
    if (cleaned.length < 3 || cleaned.length > 60) return;
    // Skip generic words
    const skip = ['the', 'a', 'an', 'and', 'or', 'for', 'with', 'natural', 'flavor', 'flavors', 'flavored',
      'serving', 'gummy', 'gummies', 'same', 'formula', 'system', 'profile', 'option', 'options',
      'variant', 'variants', 'sku', 'count', 'primary', 'secondary', 'base', 'notes', 'note'];
    if (skip.includes(cleaned.toLowerCase())) return;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      flavors.push(cleaned);
    }
  };

  // 1. SKU table rows: "SKU-XX | Brand Name — Flavor Name | ..."
  const skuPattern = /SKU[- ]?\d+\s*\|[^|]*?[—–-]\s*([^|]+)\|/gi;
  for (const m of content.matchAll(skuPattern)) {
    // Extract flavor from SKU description like "Strawberry Calm" or "Sugar-Free Black Cherry"
    const desc = m[1].trim();
    // Remove common suffixes
    const cleaned = desc
      .replace(/,?\s*\d+-count.*$/i, '')
      .replace(/,?\s*\d+\s*servings?.*$/i, '')
      .trim();
    if (cleaned) addFlavor(cleaned);
  }

  // 2. Flavor-related section headers followed by content
  // e.g., "### Flavor Strategy", "Flavor Variants:", "Flavor Options:"
  const flavorSectionPattern = /(?:flavor\s*(?:strategy|variants?|options?|profiles?|system|lineup|roadmap|plan))[:\s]*\n([\s\S]*?)(?=\n#{1,4}\s|\n---|\n\n\n)/gi;
  for (const m of content.matchAll(flavorSectionPattern)) {
    const section = m[1];
    // Extract bullet points or numbered items
    const items = section.matchAll(/[-•*]\s+\*?\*?([^*\n]+)\*?\*?/g);
    for (const item of items) {
      const text = item[1].trim().split(/[:\-–—]/)[0].trim();
      if (text.length > 2 && text.length < 50) addFlavor(text);
    }
  }

  // 3. Format table rows with flavor names: "| 45-Serving Blueberry Lavender |"
  const formatFlavorPattern = /\|\s*\d+[- ](?:Serving|Count|ct)[- ]+([^|]+?)\s*\|/gi;
  for (const m of content.matchAll(formatFlavorPattern)) {
    const name = m[1].trim();
    if (name && name.length > 2) addFlavor(name);
  }

  // 4. "Natural X Flavor" or "X & Y Flavors" patterns
  const naturalFlavorPattern = /(?:Natural\s+)?(\w+(?:\s+(?:&|and)\s+\w+)*)\s+Flavou?rs?\b/gi;
  for (const m of content.matchAll(naturalFlavorPattern)) {
    const f = m[1].trim();
    if (f.length > 2 && !['the', 'other', 'natural', 'artificial', 'with'].includes(f.toLowerCase())) {
      addFlavor(f);
    }
  }

  // 5. Common supplement flavors mentioned in context
  const commonFlavors = [
    'blueberry', 'strawberry', 'raspberry', 'blackberry', 'mixed berry',
    'cherry', 'black cherry', 'tart cherry',
    'lavender', 'lemon', 'lime', 'orange', 'mango', 'peach',
    'grape', 'watermelon', 'tropical', 'pomegranate', 'acai',
    'vanilla', 'chocolate', 'mint', 'peppermint',
    'apple', 'green apple', 'pineapple', 'passion fruit', 'guava',
    'citrus', 'ginger', 'honey', 'elderberry',
    // Pet flavors
    'chicken', 'beef', 'bacon', 'salmon', 'turkey', 'lamb',
    'peanut butter', 'liver', 'duck', 'venison', 'bison', 'pork', 'fish'
  ];

  // Look for these in flavor-adjacent context (within 200 chars of "flavor")
  const flavorContextPattern = /flavor/gi;
  for (const match of content.matchAll(flavorContextPattern)) {
    const start = Math.max(0, match.index! - 200);
    const end = Math.min(content.length, match.index! + 200);
    const context = content.substring(start, end).toLowerCase();
    for (const cf of commonFlavors) {
      if (context.includes(cf) && !seen.has(cf)) {
        addFlavor(cf.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      }
    }
  }

  // 6. Compound flavors: "Blueberry & Lavender", "Blueberry Lavender"
  const compoundPattern = /\b([A-Z][a-z]+)\s+(?:&\s+)?([A-Z][a-z]+)\s+(?:flavor|gumm)/gi;
  for (const m of content.matchAll(compoundPattern)) {
    const combo = `${m[1]} & ${m[2]}`;
    if (!seen.has(combo.toLowerCase())) {
      addFlavor(combo);
    }
  }

  return flavors;
}

/**
 * Legacy single-flavor extraction (returns first flavor or formatted string)
 */
export function extractFlavorFromFormulaBrief(content: string | null | undefined): string | null {
  const flavors = extractFlavorsFromFormulaBrief(content);
  if (flavors.length === 0) return null;
  if (flavors.length === 1) return flavors[0];
  return flavors.join(', ');
}
