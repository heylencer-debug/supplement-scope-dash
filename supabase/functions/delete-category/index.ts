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

    // 14. Finally delete the category
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
