import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EnrichedData {
  title: string | null;
  brand: string | null;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  monthly_sales: number | null;
  monthly_revenue: number | null;
  bsr_current: number | null;
  bsr_category: string | null;
  lqs: number | null;
  seller_name: string | null;
  seller_type: string | null;
  is_fba: boolean | null;
  date_first_available: string | null;
  main_image_url: string | null;
  image_urls: string[] | null;
  product_url: string | null;
  feature_bullets: string[] | null;
  dimensions: string | null;
  weight: string | null;
  price_30_days_avg: number | null;
  price_90_days_avg: number | null;
  bsr_30_days_avg: number | null;
  bsr_90_days_avg: number | null;
  estimated_revenue: number | null;
  estimated_monthly_sales: number | null;
  fees_estimate: number | null;
  variations_count: number | null;
  parent_asin: string | null;
}

function emptyData(): EnrichedData {
  return {
    title: null, brand: null, price: null, rating: null, reviews: null,
    monthly_sales: null, monthly_revenue: null, bsr_current: null, bsr_category: null,
    lqs: null, seller_name: null, seller_type: null, is_fba: null,
    date_first_available: null, main_image_url: null, image_urls: null,
    product_url: null, feature_bullets: null, dimensions: null, weight: null,
    price_30_days_avg: null, price_90_days_avg: null,
    bsr_30_days_avg: null, bsr_90_days_avg: null,
    estimated_revenue: null, estimated_monthly_sales: null,
    fees_estimate: null, variations_count: null, parent_asin: null,
  };
}

async function fetchJungleScout(asin: string, marketplace: string): Promise<Partial<EnrichedData> | null> {
  const apiKey = Deno.env.get("JUNGLE_SCOUT_API_KEY");
  if (!apiKey) {
    console.log("JUNGLE_SCOUT_API_KEY not set, skipping");
    return null;
  }

  try {
    // Use the product_database_query endpoint with include_keywords = ASIN
    const url = `https://developer.junglescout.com/api/product_database_query?marketplace=${marketplace}&page[size]=10`;
    
    const body = {
      data: {
        type: "product_database_query",
        attributes: {
          include_keywords: [asin],
          seller_type: "all",
        },
      },
    };

    console.log(`Calling Jungle Scout for ASIN: ${asin}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.junglescout.v1+json",
        "Authorization": apiKey,
        "X-API-Type": "junglescout",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Jungle Scout API error ${response.status}: ${errorText}`);
      return null;
    }

    const result = await response.json();
    const products = result?.data;
    
    if (!products || products.length === 0) {
      console.log("No products found in Jungle Scout for ASIN:", asin);
      return null;
    }

    // Find the exact ASIN match
    const product = products.find((p: any) => p.attributes?.asin === asin) || products[0];
    const attrs = product?.attributes;
    
    if (!attrs) return null;

    console.log(`Jungle Scout found product: ${attrs.title || "unknown"}`);

    return {
      title: attrs.title || null,
      brand: attrs.brand || null,
      price: attrs.price != null ? Number(attrs.price) : null,
      rating: attrs.rating != null ? Number(attrs.rating) : null,
      reviews: attrs.reviews != null ? Number(attrs.reviews) : null,
      monthly_sales: attrs.approximate_30_day_units_sold != null ? Number(attrs.approximate_30_day_units_sold) : null,
      monthly_revenue: attrs.approximate_30_day_revenue != null ? Number(attrs.approximate_30_day_revenue) : null,
      bsr_current: attrs.best_seller_rank != null ? Number(attrs.best_seller_rank) : null,
      bsr_category: attrs.top_level_category || null,
      lqs: attrs.listing_quality_score != null ? Number(attrs.listing_quality_score) : null,
      seller_name: attrs.seller || null,
      seller_type: attrs.seller_type || null,
      is_fba: attrs.fulfillment === "FBA" || attrs.is_fba || null,
      date_first_available: attrs.date_first_available || null,
      dimensions: attrs.size_tier || null,
      weight: attrs.weight_value ? `${attrs.weight_value} ${attrs.weight_unit || ''}`.trim() : null,
      fees_estimate: attrs.fba_fees != null ? Number(attrs.fba_fees) : null,
      estimated_monthly_sales: attrs.approximate_30_day_units_sold != null ? Number(attrs.approximate_30_day_units_sold) : null,
      estimated_revenue: attrs.approximate_30_day_revenue != null ? Number(attrs.approximate_30_day_revenue) : null,
      variations_count: attrs.number_of_variations != null ? Number(attrs.number_of_variations) : null,
      parent_asin: attrs.parent_asin || null,
    };
  } catch (error) {
    console.error("Jungle Scout fetch error:", error);
    return null;
  }
}

async function fetchKeepa(asin: string, domain: number): Promise<Partial<EnrichedData> | null> {
  const apiKey = Deno.env.get("KEEPA_API_KEY");
  if (!apiKey) {
    console.log("KEEPA_API_KEY not set, skipping");
    return null;
  }

  try {
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=${domain}&asin=${asin}&stats=180&rating=1&offers=20&update=1&history=0`;
    
    console.log(`Calling Keepa for ASIN: ${asin}`);
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Keepa API error ${response.status}: ${errorText}`);
      return null;
    }

    const result = await response.json();
    console.log("Keepa response keys:", Object.keys(result));
    const product = result?.products?.[0];
    
    if (!product) {
      console.log("No products found in Keepa for ASIN:", asin);
      console.log("Keepa full response:", JSON.stringify(result).substring(0, 500));
      return null;
    }

    console.log(`Keepa found product: ${product.title || "unknown"}`);
    console.log("Keepa product keys:", Object.keys(product).join(", "));
    console.log("Keepa stats type:", typeof product.stats, product.stats ? Object.keys(product.stats).join(", ") : "null");
    if (product.stats?.current) {
      console.log("Keepa stats.current (first 20):", JSON.stringify(product.stats.current?.slice?.(0, 20)));
    }
    console.log("Keepa title:", JSON.stringify(product.title), "brand:", JSON.stringify(product.brand));
    console.log("Keepa imagesCSV:", product.imagesCSV ? product.imagesCSV.substring(0, 100) : "null");
    console.log("Keepa buyBoxPrice:", product.stats?.buyBoxPrice, "listedSince:", product.listedSince);
    console.log("Keepa features:", JSON.stringify(product.features)?.substring(0, 200));

    // Parse images from imagesCSV
    let imageUrls: string[] | null = null;
    let mainImageUrl: string | null = null;
    if (product.imagesCSV) {
      const imageCodes = product.imagesCSV.split(",");
      imageUrls = imageCodes.map((code: string) => `https://images-na.ssl-images-amazon.com/images/I/${code}`);
      mainImageUrl = imageUrls[0] || null;
    }

    // Helper: Keepa uses -1 for unavailable
    const keepaVal = (v: number | undefined | null): number | null => 
      (v != null && v > 0) ? v : null;

    // Parse stats for price/rating averages
    const stats = product.stats;
    let rating: number | null = null;
    let reviews: number | null = null;
    let price30Avg: number | null = null;
    let price90Avg: number | null = null;
    let bsr30Avg: number | null = null;
    let bsr90Avg: number | null = null;
    let currentPrice: number | null = null;
    let bsrCurrent: number | null = null;

    if (stats) {
      // Current values - Keepa index: 0=Amazon, 1=New 3rd party, 3=Sales Rank, 16=Rating, 17=Review Count
      if (stats.current && Array.isArray(stats.current)) {
        const amazonPrice = keepaVal(stats.current[0]);
        const newPrice = keepaVal(stats.current[1]);
        const priceInCents = amazonPrice || newPrice;
        if (priceInCents) currentPrice = priceInCents / 100;
        
        bsrCurrent = keepaVal(stats.current[3]);
      }

      // Rating (index 16, stored as rating * 10)
      if (stats.current?.[16] > 0) {
        rating = stats.current[16] / 10;
      }
      // Review count (index 17)
      if (stats.current?.[17] > 0) {
        reviews = stats.current[17];
      }

      // Try buyBoxPrice if current prices unavailable
      if (!currentPrice && stats.buyBoxPrice > 0) {
        currentPrice = stats.buyBoxPrice / 100;
      }

      // 30-day averages
      if (stats.avg30 && Array.isArray(stats.avg30)) {
        const p30 = keepaVal(stats.avg30[0]) || keepaVal(stats.avg30[1]);
        if (p30) price30Avg = p30 / 100;
        bsr30Avg = keepaVal(stats.avg30[3]);
      }

      // 90-day averages
      if (stats.avg90 && Array.isArray(stats.avg90)) {
        const p90 = keepaVal(stats.avg90[0]) || keepaVal(stats.avg90[1]);
        if (p90) price90Avg = p90 / 100;
        bsr90Avg = keepaVal(stats.avg90[3]);
      }
    }

    // Feature bullets
    let featureBullets: string[] | null = null;
    if (product.features && Array.isArray(product.features)) {
      featureBullets = product.features;
    }

    // Date first available: Keepa stores as keepaTime minutes
    let dateFirstAvailable: string | null = null;
    if (product.listedSince > 0) {
      const unixMs = (product.listedSince + 21564000) * 60000;
      dateFirstAvailable = new Date(unixMs).toISOString().split("T")[0];
    }

    // Product URL
    const productUrl = `https://www.amazon.com/dp/${asin}`;

    // Parent ASIN
    const parentAsin = product.parentAsin || null;

    return {
      title: product.title || null,
      brand: product.brand || null,
      price: currentPrice,
      rating,
      reviews,
      bsr_current: bsrCurrent,
      bsr_category: product.categoryTree?.[0]?.name || null,
      date_first_available: dateFirstAvailable,
      main_image_url: mainImageUrl,
      image_urls: imageUrls,
      product_url: productUrl,
      feature_bullets: featureBullets,
      price_30_days_avg: price30Avg,
      price_90_days_avg: price90Avg,
      bsr_30_days_avg: bsr30Avg,
      bsr_90_days_avg: bsr90Avg,
      parent_asin: parentAsin,
    };
  } catch (error) {
    console.error("Keepa fetch error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { asin, marketplace = "us" } = await req.json();

    if (!asin || typeof asin !== "string" || asin.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid ASIN required (10+ chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Enriching ASIN: ${asin}, marketplace: ${marketplace}`);

    // Map marketplace to Keepa domain
    const keepaDomainMap: Record<string, number> = {
      us: 1, uk: 2, de: 3, fr: 4, jp: 5, ca: 6, it: 8, es: 9, in: 10, mx: 11, br: 12, au: 13,
    };
    const keepaDomain = keepaDomainMap[marketplace.toLowerCase()] || 1;

    // Call both APIs in parallel
    const [jsData, keepaData] = await Promise.all([
      fetchJungleScout(asin, marketplace),
      fetchKeepa(asin, keepaDomain),
    ]);

    // Determine source
    let source: string = "none";
    if (jsData && keepaData) source = "both";
    else if (jsData) source = "jungle_scout";
    else if (keepaData) source = "keepa";

    if (source === "none") {
      return new Response(
        JSON.stringify({ success: false, source: "none", error: "No data found from either API", data: emptyData() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge: Jungle Scout as primary, Keepa fills gaps
    const merged: EnrichedData = { ...emptyData() };
    const primary = jsData || {};
    const secondary = keepaData || {};

    for (const key of Object.keys(merged) as (keyof EnrichedData)[]) {
      const pVal = (primary as any)[key];
      const sVal = (secondary as any)[key];
      (merged as any)[key] = pVal != null ? pVal : sVal != null ? sVal : null;
    }

    console.log(`Enrichment complete. Source: ${source}. Title: ${merged.title}`);

    return new Response(
      JSON.stringify({ success: true, source, data: merged }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Enrich product error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
