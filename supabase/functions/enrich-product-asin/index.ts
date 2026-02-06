import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ======================================================
// CONFIG: Sales Curve Parameters (matching production workflow)
// ======================================================
const CATEGORY_SLOPE = -1.38;
const GENERIC_CONSTANT = 250000000;
const KEEPA_OFFSET_MINUTES = 21564000;

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
  monthly_bsr_history: Record<string, number | null> | null;
  monthly_sales_history: Record<string, number | null> | null;
  fba_fees: number | null;
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
    monthly_bsr_history: null, monthly_sales_history: null, fba_fees: null,
  };
}

// ======================================================
// HELPER: Calculate Monthly Averages from Keepa CSV data
// ======================================================
function getMonthlyBreakdown(dataArray: number[], monthsToProcess = 24): Record<string, number | null> | null {
  if (!dataArray || dataArray.length < 2) return null;

  const now = Date.now();
  const oneMonthMillis = 30 * 24 * 60 * 60 * 1000;

  const buckets: Record<number, { sum: number; count: number }> = {};
  for (let m = 1; m <= monthsToProcess; m++) buckets[m] = { sum: 0, count: 0 };

  for (let i = 0; i < dataArray.length; i += 2) {
    const keepaMinutes = dataArray[i];
    const value = dataArray[i + 1];

    if (value === -1) continue;
    const timestamp = (keepaMinutes + KEEPA_OFFSET_MINUTES) * 60000;
    const ageMillis = now - timestamp;
    const monthIndex = Math.floor(ageMillis / oneMonthMillis) + 1;
    if (monthIndex >= 1 && monthIndex <= monthsToProcess) {
      buckets[monthIndex].sum += value;
      buckets[monthIndex].count++;
    }
  }

  const result: Record<string, number | null> = {};
  for (let m = 1; m <= monthsToProcess; m++) {
    const b = buckets[m];
    result[`month_${m}`] = b.count > 0 ? Math.round(b.sum / b.count) : null;
  }
  return result;
}

// ======================================================
// HELPER: Simple average for price CSV over N days
// ======================================================
function getSimpleAvg(arr: number[], days: number): number | null {
  if (!arr || arr.length < 2) return null;
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  let sum = 0, count = 0;
  for (let i = 0; i < arr.length; i += 2) {
    if ((arr[i] + KEEPA_OFFSET_MINUTES) * 60000 >= cutoff && arr[i + 1] !== -1) {
      sum += arr[i + 1];
      count++;
    }
  }
  return count > 0 ? (sum / count) : null;
}

async function fetchJungleScout(asin: string, marketplace: string): Promise<Partial<EnrichedData> | null> {
  const apiKey = Deno.env.get("JUNGLE_SCOUT_API_KEY");
  if (!apiKey) {
    console.log("JUNGLE_SCOUT_API_KEY not set, skipping");
    return null;
  }

  try {
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

async function fetchKeepa(asin: string, domain: number, jsData: Partial<EnrichedData> | null): Promise<Partial<EnrichedData> | null> {
  const apiKey = Deno.env.get("KEEPA_API_KEY");
  if (!apiKey) {
    console.log("KEEPA_API_KEY not set, skipping");
    return null;
  }

  try {
    // Use days=730 to get 2 years of CSV history data (matching production workflow)
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=${domain}&asin=${asin}&stats=180&rating=1&days=730&update=1`;
    
    console.log(`Calling Keepa for ASIN: ${asin} (with 730 days history)`);
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Keepa API error ${response.status}: ${errorText}`);
      return null;
    }

    const result = await response.json();
    const product = result?.products?.[0];
    
    if (!product) {
      console.log("No products found in Keepa for ASIN:", asin);
      return null;
    }

    console.log(`Keepa found product: ${product.title || "unknown"}`);

    const csv = product.csv || [];

    // ======================================================
    // 1. Parse Historical BSR from csv[3]
    // ======================================================
    const bsrHistory = getMonthlyBreakdown(csv[3], 24);
    console.log(`BSR history parsed: ${bsrHistory ? Object.keys(bsrHistory).length + ' months' : 'none'}`);

    // ======================================================
    // 2. Calibrate sales estimation model
    // ======================================================
    let currentSales = 0;
    let currentRank = 0;

    // Use Jungle Scout data for calibration if available
    if (jsData) {
      currentSales = jsData.monthly_sales || 0;
      currentRank = jsData.bsr_current || 0;
    }

    // Fallback: use Keepa's latest BSR
    if (currentRank === 0 && csv[3] && csv[3].length > 1) {
      currentRank = csv[3][csv[3].length - 1];
      if (currentRank === -1) currentRank = 0;
    }

    // Calculate calibrated 'k' constant
    let k = GENERIC_CONSTANT;
    if (currentSales > 0 && currentRank > 0) {
      k = currentSales / Math.pow(currentRank, CATEGORY_SLOPE);
      console.log(`Calibrated k=${Math.round(k)} from sales=${currentSales}, rank=${currentRank}`);
    } else {
      console.log(`Using generic k=${GENERIC_CONSTANT} (no calibration data)`);
    }

    // ======================================================
    // 3. Generate monthly sales history from BSR history
    // ======================================================
    const salesHistory: Record<string, number | null> = {};
    if (bsrHistory) {
      for (const key of Object.keys(bsrHistory)) {
        const avgRank = bsrHistory[key];
        if (avgRank && avgRank > 0) {
          salesHistory[key] = Math.round(k * Math.pow(avgRank, CATEGORY_SLOPE));
        } else {
          salesHistory[key] = null;
        }
      }
    }

    // ======================================================
    // 4. Compute BSR averages from raw history (more accurate)
    // ======================================================
    const bsr30Avg = bsrHistory?.month_1 || null;
    const bsr90Avg = bsrHistory
      ? Math.round(((bsrHistory.month_1 || 0) + (bsrHistory.month_2 || 0) + (bsrHistory.month_3 || 0)) / 3)
      : null;

    // ======================================================
    // 5. Price averages from CSV (keep using simple avg)
    // ======================================================
    const priceCsv = csv[0] || csv[1]; // Amazon price or New 3P price
    const price30Raw = getSimpleAvg(priceCsv, 30);
    const price90Raw = getSimpleAvg(priceCsv, 90);
    const price30Avg = price30Raw ? price30Raw / 100 : null;
    const price90Avg = price90Raw ? price90Raw / 100 : null;

    // ======================================================
    // 6. Current price and rating from stats
    // ======================================================
    const stats = product.stats;
    const keepaVal = (v: number | undefined | null): number | null =>
      (v != null && v > 0) ? v : null;

    let rating: number | null = null;
    let reviews: number | null = null;
    let currentPrice: number | null = null;
    let bsrCurrent: number | null = null;

    if (stats) {
      if (stats.current && Array.isArray(stats.current)) {
        const amazonPrice = keepaVal(stats.current[0]);
        const newPrice = keepaVal(stats.current[1]);
        const listPrice = keepaVal(stats.current[4]);
        const warehousePrice = keepaVal(stats.current[9]);
        const priceInCents = amazonPrice || newPrice || listPrice || warehousePrice;
        if (priceInCents) currentPrice = priceInCents / 100;

        bsrCurrent = keepaVal(stats.current[3]);
      }

      if (stats.current?.[16] > 0) {
        rating = stats.current[16] / 10;
      }
      if (stats.current?.[17] > 0) {
        reviews = stats.current[17];
      }

      if (!currentPrice && stats.buyBoxPrice > 0) {
        currentPrice = stats.buyBoxPrice / 100;
      }

      if (!currentPrice && price30Avg) {
        currentPrice = price30Avg;
      } else if (!currentPrice && price90Avg) {
        currentPrice = price90Avg;
      }
    }

    // ======================================================
    // 7. FBA fees from Keepa
    // ======================================================
    const fbaFees = product.fbaFees?.pickAndPackFee
      ? product.fbaFees.pickAndPackFee / 100
      : null;
    console.log(`FBA fees: ${fbaFees}`);

    // ======================================================
    // 8. Other fields
    // ======================================================
    let imageUrls: string[] | null = null;
    let mainImageUrl: string | null = null;
    if (product.imagesCSV) {
      const imageCodes = product.imagesCSV.split(",");
      imageUrls = imageCodes.map((code: string) => `https://images-na.ssl-images-amazon.com/images/I/${code}`);
      mainImageUrl = imageUrls[0] || null;
    }

    let featureBullets: string[] | null = null;
    if (product.features && Array.isArray(product.features)) {
      featureBullets = product.features;
    }

    let dateFirstAvailable: string | null = null;
    if (product.listedSince > 0) {
      const unixMs = (product.listedSince + KEEPA_OFFSET_MINUTES) * 60000;
      dateFirstAvailable = new Date(unixMs).toISOString().split("T")[0];
    }

    const productUrl = `https://www.amazon.com/dp/${asin}`;
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
      monthly_bsr_history: bsrHistory,
      monthly_sales_history: Object.keys(salesHistory).length > 0 ? salesHistory : null,
      fba_fees: fbaFees,
      fees_estimate: fbaFees,
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

    const keepaDomainMap: Record<string, number> = {
      us: 1, uk: 2, de: 3, fr: 4, jp: 5, ca: 6, it: 8, es: 9, in: 10, mx: 11, br: 12, au: 13,
    };
    const keepaDomain = keepaDomainMap[marketplace.toLowerCase()] || 1;

    // Fetch Jungle Scout first (needed for Keepa calibration)
    const jsData = await fetchJungleScout(asin, marketplace);
    
    // Fetch Keepa with JS data for calibration
    const keepaData = await fetchKeepa(asin, keepaDomain, jsData);

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
    console.log(`Historical data: BSR history=${merged.monthly_bsr_history ? 'yes' : 'no'}, Sales history=${merged.monthly_sales_history ? 'yes' : 'no'}, FBA fees=${merged.fba_fees}`);

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
