import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { product_id, asin } = await req.json();

    if (!product_id && !asin) {
      return new Response(
        JSON.stringify({ success: false, error: "product_id or asin required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve product
    let productAsin = asin;
    let productIds: string[] = [];

    if (product_id) {
      // Single product by ID
      const { data: product, error } = await supabase
        .from("products")
        .select("id, asin")
        .eq("id", product_id)
        .single();
      if (error || !product) {
        return new Response(
          JSON.stringify({ success: false, error: `Product not found: ${error?.message}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      productAsin = product.asin;
      productIds = [product.id];
    } else {
      // Find all products with this ASIN
      const { data: products, error } = await supabase
        .from("products")
        .select("id, asin")
        .eq("asin", asin);
      if (error || !products?.length) {
        return new Response(
          JSON.stringify({ success: false, error: `No products found with ASIN: ${asin}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      productIds = products.map((p: any) => p.id);
    }

    console.log(`Enriching ASIN ${productAsin} for ${productIds.length} product(s)`);

    // Call the enrich-product-asin function
    const enrichUrl = `${supabaseUrl}/functions/v1/enrich-product-asin`;
    const enrichResponse = await fetch(enrichUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ asin: productAsin, marketplace: "us" }),
    });

    const enrichResult = await enrichResponse.json();

    if (!enrichResult.success || enrichResult.source === "none") {
      console.error("Enrichment failed:", enrichResult.error);
      return new Response(
        JSON.stringify({ success: false, error: enrichResult.error || "No enrichment data found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const d = enrichResult.data;
    console.log(`Enrichment source: ${enrichResult.source}. Updating ${productIds.length} product(s).`);

    // Build update payload — only set non-null values
    const updatePayload: Record<string, any> = {};
    
    if (d.title) updatePayload.title = d.title;
    if (d.brand) updatePayload.brand = d.brand;
    if (d.price != null) updatePayload.price = d.price;
    if (d.price != null) updatePayload.current_price = d.price;
    if (d.rating != null) updatePayload.rating = d.rating;
    if (d.rating != null) updatePayload.rating_value = d.rating;
    if (d.reviews != null) updatePayload.reviews = d.reviews;
    if (d.reviews != null) updatePayload.rating_count = d.reviews;
    if (d.monthly_sales != null) updatePayload.monthly_sales = d.monthly_sales;
    if (d.monthly_sales != null) updatePayload.estimated_monthly_sales = d.monthly_sales;
    if (d.monthly_revenue != null) updatePayload.monthly_revenue = d.monthly_revenue;
    if (d.monthly_revenue != null) updatePayload.estimated_revenue = d.monthly_revenue;
    if (d.bsr_current != null) updatePayload.bsr_current = d.bsr_current;
    if (d.bsr_category) updatePayload.bsr_category = d.bsr_category;
    if (d.lqs != null) updatePayload.lqs = d.lqs;
    if (d.seller_name) updatePayload.seller_name = d.seller_name;
    if (d.seller_type) updatePayload.seller_type = d.seller_type;
    if (d.is_fba != null) updatePayload.is_fba = d.is_fba;
    if (d.date_first_available) updatePayload.date_first_available = d.date_first_available;
    if (d.main_image_url) {
      updatePayload.main_image_url = d.main_image_url;
      updatePayload.image_url = d.main_image_url;
    }
    if (d.image_urls?.length) {
      updatePayload.image_urls = d.image_urls;
      updatePayload.images_count = d.image_urls.length;
    }
    if (d.product_url) updatePayload.product_url = d.product_url;
    if (d.feature_bullets?.length) {
      updatePayload.feature_bullets = d.feature_bullets;
      updatePayload.bullets_count = d.feature_bullets.length;
    }
    if (d.dimensions) updatePayload.dimensions = d.dimensions;
    if (d.weight) updatePayload.weight = d.weight;
    if (d.price_30_days_avg != null) updatePayload.price_30_days_avg = d.price_30_days_avg;
    if (d.price_90_days_avg != null) updatePayload.price_90_days_avg = d.price_90_days_avg;
    if (d.bsr_30_days_avg != null) updatePayload.bsr_30_days_avg = d.bsr_30_days_avg;
    if (d.bsr_90_days_avg != null) updatePayload.bsr_90_days_avg = d.bsr_90_days_avg;
    if (d.fees_estimate != null) updatePayload.fees_estimate = d.fees_estimate;
    if (d.variations_count != null) updatePayload.variations_count = d.variations_count;
    if (d.parent_asin) updatePayload.parent_asin = d.parent_asin;

    // New fields from enhanced Keepa extraction
    if (d.description_text) updatePayload.description_text = d.description_text;
    if (d.manufacturer) updatePayload.manufacturer = d.manufacturer;
    if (d.categories_flat) updatePayload.categories_flat = d.categories_flat;
    if (d.is_fba != null) updatePayload.is_fba = d.is_fba;

    // Store historical data (BSR + sales histories + is_sns) in JSONB column
    const historicalExtras: Record<string, any> = {};
    if (d.monthly_bsr_history) historicalExtras.monthly_bsr_history = d.monthly_bsr_history;
    if (d.monthly_sales_history) historicalExtras.monthly_sales_history = d.monthly_sales_history;
    if (d.is_sns != null) historicalExtras.is_sns = d.is_sns;
    if (Object.keys(historicalExtras).length > 0) {
      updatePayload.historical_data = historicalExtras;
    }

    // FBA fees from Keepa (overrides JS fees if available)
    if (d.fba_fees != null) {
      updatePayload.fees_estimate = d.fba_fees;
    }

    // Calculate net_estimate: revenue - 30% COGS - (fees * monthly_sales)
    const monthlyRevenue = d.monthly_revenue || 0;
    const monthlySales = d.monthly_sales || 0;
    const feesPerUnit = d.fba_fees || d.fees_estimate || 0;
    if (monthlyRevenue > 0) {
      const estimatedCogs = monthlyRevenue * 0.30;
      const totalFees = feesPerUnit * monthlySales;
      updatePayload.net_estimate = Math.round(monthlyRevenue - estimatedCogs - totalFees);
    }

    updatePayload.updated_at = new Date().toISOString();

    console.log(`Update payload has ${Object.keys(updatePayload).length} fields`);

    // Update all matching products
    const { data: updated, error: updateError } = await supabase
      .from("products")
      .update(updatePayload)
      .in("id", productIds)
      .select("id, asin, title, price, rating, reviews, bsr_current");

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully updated ${updated?.length} product(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        source: enrichResult.source,
        products_updated: updated?.length || 0,
        fields_updated: Object.keys(updatePayload).length,
        updated_products: updated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Update product enrichment error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
