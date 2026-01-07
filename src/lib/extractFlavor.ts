/**
 * Extracts flavor information from formula brief markdown content.
 * Looks for common flavor patterns and returns a standardized flavor string.
 */
export function extractFlavorFromFormulaBrief(formulaBriefContent: string | null | undefined): string | null {
  if (!formulaBriefContent) return null;
  
  const content = formulaBriefContent.toLowerCase();
  
  // Common flavor keywords and patterns to search for
  const flavorPatterns = [
    // Direct flavor mentions
    /flavor(?:ed)?[:\s]+([^.\n,]+)/gi,
    /palatability[:\s]+([^.\n]+)/gi,
    // Specific flavors in context
    /natural\s+(\w+(?:\s+(?:&|and)\s+\w+)?)\s+flavor/gi,
    /(\w+(?:\s+(?:&|and)\s+\w+)?)\s+flavored?/gi,
    // Flavor profile sections
    /flavor\s*profile[:\s]+([^.\n]+)/gi,
    // Common protein-based flavors
    /(chicken|beef|bacon|salmon|fish|turkey|lamb|peanut\s*butter|liver|duck|venison|bison|pork)(?:\s+(?:&|and)\s+(\w+))?\s*(?:flavor)?/gi,
  ];
  
  const foundFlavors: string[] = [];
  
  // Look for flavor-related sections in markdown
  const lines = formulaBriefContent.split('\n');
  let inFlavorSection = false;
  
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    
    // Check if we're entering a flavor-related section
    if (lineLower.includes('flavor') || lineLower.includes('palatability') || lineLower.includes('taste')) {
      inFlavorSection = true;
      
      // Check for direct flavor mentions in headers or bullets
      const flavorMatch = line.match(/[:\-•]\s*(.+?)(?:\s*[-–]\s*|$)/);
      if (flavorMatch && flavorMatch[1].length < 50) {
        const flavor = flavorMatch[1].trim();
        if (flavor && !flavor.toLowerCase().includes('flavor') && flavor.length > 2) {
          foundFlavors.push(flavor);
        }
      }
    }
    
    // Extract flavors mentioned in the content
    if (inFlavorSection || lineLower.includes('flavor')) {
      // Look for specific protein flavors
      const proteinFlavors = line.match(/(chicken|beef|bacon|salmon|fish|turkey|lamb|peanut\s*butter|liver|duck|venison|bison|pork)/gi);
      if (proteinFlavors) {
        proteinFlavors.forEach(f => {
          const capitalizedFlavor = f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
          if (!foundFlavors.some(existing => existing.toLowerCase().includes(f.toLowerCase()))) {
            foundFlavors.push(capitalizedFlavor);
          }
        });
      }
      
      // Look for combined flavors (e.g., "Chicken & Bacon")
      const combinedMatch = line.match(/(chicken|beef|bacon|salmon|turkey|lamb|liver|duck|pork)\s*(?:&|and)\s*(chicken|beef|bacon|salmon|turkey|lamb|liver|duck|pork)/gi);
      if (combinedMatch) {
        combinedMatch.forEach(combo => {
          const cleaned = combo.replace(/\s+and\s+/gi, ' & ').replace(/\s+/g, ' ').trim();
          const parts = cleaned.split(/\s*&\s*/);
          const formattedCombo = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' & ');
          // Remove individual flavors and add the combo
          foundFlavors.length = 0;
          foundFlavors.push(formattedCombo);
        });
      }
    }
    
    // Reset section tracking after empty line
    if (line.trim() === '') {
      inFlavorSection = false;
    }
  }
  
  // Apply patterns to full content for additional matches
  for (const pattern of flavorPatterns) {
    const matches = formulaBriefContent.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const flavor = match[1].trim();
        // Filter out generic words and very long matches
        if (flavor.length > 2 && flavor.length < 40 && 
            !['the', 'a', 'an', 'and', 'or', 'for', 'with', 'natural'].includes(flavor.toLowerCase())) {
          if (!foundFlavors.some(f => f.toLowerCase() === flavor.toLowerCase())) {
            foundFlavors.push(flavor.charAt(0).toUpperCase() + flavor.slice(1));
          }
        }
      }
    }
  }
  
  if (foundFlavors.length === 0) return null;
  
  // Format the final flavor string
  if (foundFlavors.length === 1) {
    return `Natural ${foundFlavors[0]} Flavor`;
  } else if (foundFlavors.length === 2) {
    return `Natural ${foundFlavors[0]} & ${foundFlavors[1]} Flavor`;
  } else {
    // Take top 2 most relevant flavors
    return `Natural ${foundFlavors[0]} & ${foundFlavors[1]} Flavor`;
  }
}
