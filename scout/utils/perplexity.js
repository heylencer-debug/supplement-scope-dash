/**
 * perplexity.js — Perplexity Sonar API helper
 *
 * 2026-08-28: P5's off-Amazon SOURCE DISCOVERY (findAndScrapeSource()) was
 * built on a DuckDuckGo HTML scrape (searchViaDuckDuckGo) that returns 0
 * links on every run — confirmed the ISP proxy itself connects fine
 * (viaBrightData: true, other page fetches through it work), but DDG/SERP
 * simply returns nothing usable through it either (challenge page or empty
 * result set). Rather than keep chasing SERP scraping, P5 now uses
 * Perplexity's Sonar models to do the WEB DISCOVERY step directly — Sonar
 * already browses the live web and returns synthesized findings + real
 * citation URLs, so it replaces both "search" and "read the top result"
 * in one call. The raw destination pages Perplexity cites are then
 * (optionally) re-fetched via the existing Bright Data browser chain for a
 * raw-text excerpt, but Perplexity's own findings are useful on their own
 * even if that raw fetch fails.
 *
 * Env:
 *   PERPLEXITY_API_KEY   required — if unset, researchBrand() returns null
 *                        immediately so callers can cleanly fall back.
 *   PERPLEXITY_MODEL     default 'sonar-pro'
 */

function getPerplexityKey() {
  const key = process.env.PERPLEXITY_API_KEY || null;
  return (key && !/^REPLACE_ME/i.test(key)) ? key : null;
}

const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar-pro';

/**
 * Research a single competitor product via Perplexity Sonar.
 * Returns { content, citations } on success, or null if:
 *   - PERPLEXITY_API_KEY isn't set
 *   - the API call fails / errors
 *   - the response has no usable content
 * NEVER throws — callers should treat null as "skip Perplexity, fall back".
 */
async function researchBrand(brand, productTitle, keyword) {
  const key = getPerplexityKey();
  if (!key) {
    console.log('  [Perplexity] PERPLEXITY_API_KEY not set — skipping Perplexity discovery');
    return null;
  }

  const label = `${brand || ''} ${productTitle || ''}`.trim() || (keyword || 'this product');
  const prompt = `Research the supplement product "${label}"${keyword ? ` (category: ${keyword})` : ''}. Report:
- Exact ingredients and doses per serving
- Standardized extract forms / bioavailable forms used (if any)
- Certifications and third-party testing (NSF, USP, Informed Sport, GMP, etc.)
- Clinical claims made on the label or brand site
- Off-Amazon retail price (brand's official site and/or major retailers like iHerb, Walmart, Vitamin Shoppe)
Use the brand's official website and major retailers as your primary sources. Be specific and factual — cite exact numbers where available, and say "not disclosed" for anything you can't confirm.`;

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: 'You are a precise supplement-industry research assistant. Only report facts you can verify from live web sources; never fabricate ingredient doses or certifications.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.log(`  [Perplexity] API call failed [${res.status}] for "${label}": ${text.slice(0, 300)}`);
      return null;
    }

    let j;
    try { j = JSON.parse(text); } catch {
      console.log(`  [Perplexity] non-JSON response for "${label}" — treating as failure`);
      return null;
    }

    if (j.error) {
      console.log(`  [Perplexity] error for "${label}": ${j.error.message || JSON.stringify(j.error)}`);
      return null;
    }

    const choice = j.choices?.[0];
    const finishReason = choice?.finish_reason || 'unknown';
    console.log(`  [Perplexity] finish_reason=${finishReason} usage=${JSON.stringify(j.usage || {})} for "${label}"`);

    const content = choice?.message?.content || null;
    if (!content) {
      console.log(`  [Perplexity] empty content for "${label}"`);
      return null;
    }

    // Citations: Perplexity returns a top-level `citations` array (list of
    // URL strings) on most Sonar responses. Some responses instead (or
    // additionally) carry per-message URL annotations
    // (message.annotations[].url / message.annotations[].url_citation.url).
    // Handle both shapes, dedupe, never throw on an unexpected shape.
    const citations = new Set();
    if (Array.isArray(j.citations)) {
      for (const c of j.citations) {
        if (typeof c === 'string') citations.add(c);
        else if (c?.url) citations.add(c.url);
      }
    }
    const annotations = choice?.message?.annotations || j.annotations || [];
    if (Array.isArray(annotations)) {
      for (const a of annotations) {
        const url = a?.url || a?.url_citation?.url;
        if (url) citations.add(url);
      }
    }

    return { content, citations: Array.from(citations) };
  } catch (err) {
    console.log(`  [Perplexity] request errored for "${label}": ${err.message}`);
    return null;
  }
}

module.exports = { researchBrand, getPerplexityKey, PERPLEXITY_MODEL };
