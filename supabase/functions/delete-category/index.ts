import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId } = await req.json();

    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: "categoryId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Deleting category: ${categoryId}`);

    // Create Supabase client with service role for cascade deletion
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 0. Resolve the category's EXACT session keyword BEFORE anything else is
    // deleted — this is what scopes the raw dovive_* table cleanup below.
    // Mirrors utils/category-resolver.js / run-pipeline.js's own derivation:
    // search_term is the canonical session label (includes "#N" for repeat
    // sessions), falling back to name only if search_term is somehow null.
    // If the category row itself can't be read, skip raw cleanup entirely
    // (fail open) rather than guess a keyword and risk cross-session damage.
    const { data: categoryRow, error: categoryReadError } = await supabase
      .from("categories")
      .select("search_term, name")
      .eq("id", categoryId)
      .maybeSingle();

    if (categoryReadError) {
      console.error("Error reading category for keyword resolution:", categoryReadError);
    }

    const exactKeyword = (categoryRow?.search_term || categoryRow?.name || "").trim();

    // Delete in order to respect foreign key constraints
    // 1. Delete reviews first (references products and categories)
    const { error: reviewsError } = await supabase
      .from("reviews")
      .delete()
      .eq("category_id", categoryId);
    
    if (reviewsError) {
      console.error("Error deleting reviews:", reviewsError);
    }

    // 2. Delete nlp_aspects (references products)
    const { data: products } = await supabase
      .from("products")
      .select("id")
      .eq("category_id", categoryId);

    if (products && products.length > 0) {
      const productIds = products.map(p => p.id);
      
      const { error: aspectsError } = await supabase
        .from("nlp_aspects")
        .delete()
        .in("product_id", productIds);
      
      if (aspectsError) {
        console.error("Error deleting nlp_aspects:", aspectsError);
      }

      // 3. Delete competitors (references products)
      const { error: competitorsError } = await supabase
        .from("competitors")
        .delete()
        .in("product_id", productIds);
      
      if (competitorsError) {
        console.error("Error deleting competitors:", competitorsError);
      }
    }

    // 4. Delete products
    const { error: productsError } = await supabase
      .from("products")
      .delete()
      .eq("category_id", categoryId);
    
    if (productsError) {
      console.error("Error deleting products:", productsError);
    }

    // 5. Delete formula_conversations (references formula_brief_versions and categories)
    const { error: conversationsError } = await supabase
      .from("formula_conversations")
      .delete()
      .eq("category_id", categoryId);
    
    if (conversationsError) {
      console.error("Error deleting formula_conversations:", conversationsError);
    }

    // 6. Delete formula_generation_tasks
    const { error: tasksError } = await supabase
      .from("formula_generation_tasks")
      .delete()
      .eq("category_id", categoryId);
    
    if (tasksError) {
      console.error("Error deleting formula_generation_tasks:", tasksError);
    }

    // 7. Delete ingredient_analyses
    const { error: ingredientError } = await supabase
      .from("ingredient_analyses")
      .delete()
      .eq("category_id", categoryId);
    
    if (ingredientError) {
      console.error("Error deleting ingredient_analyses:", ingredientError);
    }

    // 8. Delete packaging_analyses
    const { error: packagingError } = await supabase
      .from("packaging_analyses")
      .delete()
      .eq("category_id", categoryId);
    
    if (packagingError) {
      console.error("Error deleting packaging_analyses:", packagingError);
    }

    // 9. Delete competitive_analyses
    const { error: competitiveError } = await supabase
      .from("competitive_analyses")
      .delete()
      .eq("category_id", categoryId);
    
    if (competitiveError) {
      console.error("Error deleting competitive_analyses:", competitiveError);
    }

    // 10. Delete formula_brief_versions
    const { error: versionsError } = await supabase
      .from("formula_brief_versions")
      .delete()
      .eq("category_id", categoryId);
    
    if (versionsError) {
      console.error("Error deleting formula_brief_versions:", versionsError);
    }

    // 11. Delete formula_briefs
    const { error: briefsError } = await supabase
      .from("formula_briefs")
      .delete()
      .eq("category_id", categoryId);
    
    if (briefsError) {
      console.error("Error deleting formula_briefs:", briefsError);
    }

    // 12. Delete category_scores
    const { error: scoresError } = await supabase
      .from("category_scores")
      .delete()
      .eq("category_id", categoryId);
    
    if (scoresError) {
      console.error("Error deleting category_scores:", scoresError);
    }

    // 13. Delete category_analyses
    const { error: analysesError } = await supabase
      .from("category_analyses")
      .delete()
      .eq("category_id", categoryId);
    
    if (analysesError) {
      console.error("Error deleting category_analyses:", analysesError);
    }

    // 14. Delete the raw dovive_* scrape/research tables for this EXACT
    // session keyword. These tables are keyed by `keyword` text (not
    // category_id) and are otherwise untouched by the deletes above, which
    // orphaned them on every prior delete-category call (manually cleaned up
    // twice before this fix — see scout/DEPLOY_NOTES.md 2026-09-01 entries).
    //
    // CRITICAL: use case-insensitive EXACT match (.ilike with no wildcards),
    // never a first-word/substring ilike ("%word%") — a substring match on a
    // base keyword ("electrolyte powder") would also delete a sibling
    // session's rows ("electrolyte powder #2"), and vice versa. This is the
    // exact "eca3061" lesson from the pipeline's own session-isolation fixes.
    //
    // Table list audited 2026-09-02 against the LIVE PostgREST schema (12
    // real dovive_* tables confirmed to exist; several table names that only
    // ever appeared in code comments or the superseded 001 migration —
    // dovive_products, dovive_specs, dovive_reports, dovive_bsr_products —
    // do NOT exist in this project and were excluded). Of the 12 real
    // tables, these 9 are genuinely keyword-session-scoped raw pipeline
    // output and are cleaned here:
    //   - dovive_research           (P1 scrape, UNIQUE(asin,keyword))
    //   - dovive_history            (P1 append-only scrape log)
    //   - dovive_reviews            (P3 reviews, append-only)
    //   - dovive_keepa              (P2 Keepa data; UNIQUE(asin) globally
    //                                 shared across sessions that scrape the
    //                                 same physical ASIN, but `keyword` is
    //                                 first-writer-attribution only — the
    //                                 category's own already-copied
    //                                 `products` rows are untouched by this
    //                                 delete, so removing the raw row here
    //                                 is safe; matches the precedent set by
    //                                 the 2026-09-01 "zzz cheap mode" cleanup)
    //   - dovive_ocr                (P4 OCR; UNIQUE(asin,image_index)
    //                                 globally, same first-writer-attribution
    //                                 reasoning as dovive_keepa above)
    //   - dovive_phase5_research    (P5 deep research, UNIQUE(asin,keyword))
    //   - dovive_p5_sources         (P5 off-Amazon source excerpts)
    //   - dovive_packaging_intelligence (P7 category-level summary,
    //                                 UNIQUE(keyword))
    //   - dovive_keywords           (P1's keyword registry row for this
    //                                 exact session label — bookkeeping only,
    //                                 not consulted by the Cloud Run
    //                                 pipeline's own gating logic)
    //
    // Deliberately NOT touched by this cleanup (documented, not an
    // oversight):
    //   - ai_usage_log   — per-run AI cost ledger. KEPT as permanent cost
    //                      history even after the category is deleted.
    //   - scout_jobs     — job run history/audit trail. KEPT so past runs
    //                      remain visible even for a deleted category.
    //   - dovive_market_opportunities — P0's category market-SCAN history,
    //                      keyed by `category_name` from an independent
    //                      opportunity scan, not by this pipeline's session
    //                      `keyword` — not this category's session data.
    //   - dovive_scout_config — global secrets/config, never keyword-scoped.
    //   - dovive_jobs    — legacy scout-agent.js poller queue (a different,
    //                      non-Cloud-Run system), not this category's data.
    if (exactKeyword) {
      const rawKeywordTables = [
        "dovive_research",
        "dovive_history",
        "dovive_reviews",
        "dovive_keepa",
        "dovive_ocr",
        "dovive_phase5_research",
        "dovive_p5_sources",
        "dovive_packaging_intelligence",
        "dovive_keywords",
      ];

      for (const table of rawKeywordTables) {
        const { error: rawError } = await supabase
          .from(table)
          .delete()
          .ilike("keyword", exactKeyword);

        if (rawError) {
          console.error(`Error deleting from ${table} for keyword "${exactKeyword}":`, rawError);
        } else {
          console.log(`Cleaned raw table ${table} for keyword "${exactKeyword}"`);
        }
      }
    } else {
      console.error(
        `Could not resolve an exact session keyword for category ${categoryId} — skipping raw dovive_* table cleanup (fail open, category/products/analyses deletion still proceeds).`
      );
    }

    // 15. Finally delete the category
    const { error: categoryError } = await supabase
      .from("categories")
      .delete()
      .eq("id", categoryId);
    
    if (categoryError) {
      console.error("Error deleting category:", categoryError);
      return new Response(
        JSON.stringify({ error: "Failed to delete category", details: categoryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully deleted category: ${categoryId}`);

    return new Response(
      JSON.stringify({ success: true, message: "Category and all related data deleted" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in delete-category function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
