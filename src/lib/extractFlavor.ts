/**
 * Extracts ALL flavor information from formula brief markdown content.
 * Returns an array of unique, cleaned flavor strings.
 * 
 * Real data patterns found:
 * - SKU rows: "| SKU-01 | Brand — Tropical Mango [UPDATED]** | ..."
 * - SKU rows: "| SKU-01 | Brand — Strawberry Lemonade | ..."
 * - Excipient table: "| Natural Flavors | 600 mg | Sour Blue Raspberry / Watermelon |"
 * - Flavor Profile: "**Flavor Profile** | **High Sour / High Sweet.** (Recommended: Sour Blue Raspberry or Sour Watermelon)"
 * - Flavor mentions: "Tropical Mango as the lead flavor"
 * - Format table: "| 45-Serving Blueberry Lavender |"
 */
export function extractFlavorsFromFormulaBrief(content: string | null | undefined): string[] {
  if (!content) return [];

  const seen = new Set<string>();
  const flavors: string[] = [];

  const addFlavor = (raw: string) => {
    let f = raw.trim()
      .replace(/[*_`]/g, '')                     // strip markdown bold/italic
      .replace(/\[UPDATED\]/gi, '')               // remove [UPDATED] tags
      .replace(/\s*\(.*?\)\s*$/g, '')             // remove trailing parenthetical like (180ct)
      .replace(/^\d+[-– ]*(?:count|ct|serving)s?\s*/i, '')  // remove "60-count" prefix
      .replace(/\s*[-–—]+\s*$/, '')               // trailing dashes
      .replace(/\s+/g, ' ')
      .trim();

    if (f.length < 3 || f.length > 50) return;

    // Skip non-flavor strings
    const skipWords = [
      'month supply', 'primary', 'value', 'bulk', 'pricing', 'margin',
      'targets', 'format', 'msrp', 'serving', 'gummy', 'gummies',
      'the', 'and', 'natural', 'flavor', 'flavors', 'profile',
    ];
    if (skipWords.some(w => f.toLowerCase() === w || f.toLowerCase().startsWith(w + ' '))) return;
    // Skip if it looks like a section header, price, or pipe artifact
    if (f.startsWith('#') || f.startsWith('---') || f.startsWith('|') || f.startsWith('$')) return;

    const key = f.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      // Title case
      f = f.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      flavors.push(f);
    }
  };

  // 1. SKU table rows: "| SKU-01 | Brand — Tropical Mango [UPDATED]** | size | price |"
  //    The flavor is between the dash and the next pipe
  const skuPattern = /\|\s*SKU[- ]?\d+\s*\|[^|]*?[—–-]\s+([^|*\[\n]+)/gi;
  for (const m of content.matchAll(skuPattern)) {
    let desc = m[1].trim()
      .replace(/\[UPDATED\]/gi, '')
      .replace(/\*+/g, '')
      .replace(/\s*\(.*?\)/g, '')
      .trim();
    // Skip size/supply variants
    if (/^\d+[-\s]*month|supply|count|ct\b/i.test(desc)) continue;
    if (desc) addFlavor(desc);
  }

  // 2. Natural Flavors row in excipient table: "| Natural Flavors | XXmg | Sour Blue Raspberry / Watermelon |"
  const naturalFlavorsPattern = /\|\s*\*?\*?Natural Flavou?rs?\*?\*?\s*\|[^|]*\|\s*([^|]+)\|/gi;
  for (const m of content.matchAll(naturalFlavorsPattern)) {
    const desc = m[1].trim();
    // Split by / or ; for multiple flavors
    const parts = desc.split(/[\/;]/).map(p => p.trim());
    for (const part of parts) {
      // Extract the flavor name, removing explanatory text
      const flavorName = part.split(/\s+(?:profile|masks?|for|to|with)\s+/i)[0].trim();
      if (flavorName.length > 2 && flavorName.length < 40) {
        addFlavor(flavorName);
      }
    }
  }

  // 3. Flavor Profile lines: "Flavor Profile | Sour Blue Raspberry" or "**Flavor Profile:** Tropical Mango"
  const flavorProfilePattern = /\*?\*?Flavou?r\s*Profile\*?\*?\s*[|:]\s*\*?\*?([^|\n]+)/gi;
  for (const m of content.matchAll(flavorProfilePattern)) {
    const desc = m[1].trim().replace(/\*+/g, '');
    // Could be "High Sour / High Sweet. (Recommended: Sour Blue Raspberry or Sour Watermelon)"
    const recMatch = desc.match(/Recommended:\s*(.+?)(?:\)|$)/i);
    if (recMatch) {
      const recs = recMatch[1].split(/\s+or\s+/i);
      recs.forEach(r => addFlavor(r.trim()));
    } else {
      // Direct flavor mention
      const parts = desc.split(/[\/,]/).map(p => p.trim()).filter(p => p.length > 2 && p.length < 40);
      for (const p of parts) {
        if (!/high\s+(?:sour|sweet)/i.test(p)) addFlavor(p);
      }
    }
  }

  // 4. "X as the lead flavor" — capture just the flavor name (1-3 words before "as the")
  const leadFlavorPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+as\s+the\s+(?:lead|primary|main)\s+flavou?r/g;
  for (const m of content.matchAll(leadFlavorPattern)) {
    addFlavor(m[1]);
  }

  // 5. "Natural X flavor" in excipient/Flavors & Colors sections
  //    e.g., "Natural tropical mango flavor", "Natural strawberry flavor"
  const naturalFlavorIngredient = /Natural\s+([\w\s]+?)\s+flavou?r\s*(?:\(|[:\-–—|])/gi;
  for (const m of content.matchAll(naturalFlavorIngredient)) {
    const f = m[1].trim();
    if (f.length > 2 && f.length < 40 && !/other|artificial/i.test(f)) {
      addFlavor(f);
    }
  }

  // 6. Flavor Profile description: "Recommended: Sour Blue Raspberry or Sour Watermelon"
  //    or standalone: "Flavor Profile: Tropical Mango"
  const flavorProfilePattern2 = /(?:recommended|suggested)\s*(?:flavou?rs?)?:\s*(.+?)(?:\)|\.|\n)/gi;
  for (const m of content.matchAll(flavorProfilePattern2)) {
    const items = m[1].split(/\s+or\s+|\s*,\s*/i);
    items.forEach(item => {
      const cleaned = item.trim().replace(/[*_`]/g, '');
      if (cleaned.length > 2 && cleaned.length < 40) addFlavor(cleaned);
    });
  }

  // 7. Format/pricing table: "| 45-Serving Blueberry Lavender |"
  const formatPattern = /\|\s*\d+[-\s]*(?:Serving|Count|ct)\s+(.+?)\s*\|/gi;
  for (const m of content.matchAll(formatPattern)) {
    const name = m[1].trim().replace(/[—–-]+.*$/, '').trim();
    if (name.length > 2 && !/primary|value|bulk|month/i.test(name)) {
      addFlavor(name);
    }
  }

  // 8. Flavor-specific sections: bullet points under "Flavor Strategy" etc.
  const flavorSections = content.matchAll(/#{1,4}\s*(?:Flavou?r\s*(?:Strategy|Variants?|Options?|Lineup|Roadmap|Development))[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s|\n---)/gi);
  for (const section of flavorSections) {
    const bullets = section[1].matchAll(/[-•*]\s+\*?\*?([^*\n:]+)/g);
    for (const b of bullets) {
      const text = b[1].trim().split(/[:\-–—]/)[0].trim();
      if (text.length > 2 && text.length < 40) addFlavor(text);
    }
  }

  return flavors;
}

/**
 * Legacy single-flavor extraction (returns comma-separated string)
 */
export function extractFlavorFromFormulaBrief(content: string | null | undefined): string | null {
  const flavors = extractFlavorsFromFormulaBrief(content);
  if (flavors.length === 0) return null;
  return flavors.join(', ');
}
