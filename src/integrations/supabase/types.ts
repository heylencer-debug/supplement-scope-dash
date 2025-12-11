export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          amazon_categories: string[] | null
          category_id: string | null
          created_at: string | null
          id: string
          last_scanned: string | null
          name: string
          run_number: number | null
          run_timestamp: string | null
          search_term: string | null
          total_products: number | null
          updated_at: string | null
          workflow_run_id: string | null
        }
        Insert: {
          amazon_categories?: string[] | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          last_scanned?: string | null
          name: string
          run_number?: number | null
          run_timestamp?: string | null
          search_term?: string | null
          total_products?: number | null
          updated_at?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          amazon_categories?: string[] | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          last_scanned?: string | null
          name?: string
          run_number?: number | null
          run_timestamp?: string | null
          search_term?: string | null
          total_products?: number | null
          updated_at?: string | null
          workflow_run_id?: string | null
        }
        Relationships: []
      }
      category_analyses: {
        Row: {
          analysis_1_category_scores: Json | null
          analysis_2_opportunity_calculation: Json | null
          analysis_3_formula_brief: Json | null
          analysis_date: string | null
          category_contributions: Json | null
          category_id: string | null
          category_name: string
          confidence: string | null
          created_at: string | null
          criteria_scores: Json | null
          estimated_profit_margin: number | null
          executive_summary: string | null
          formula_brief: Json | null
          formula_brief_html: string | null
          formula_brief_pdf_url: string | null
          id: string
          key_insights: Json | null
          market_analysis_html: string | null
          market_analysis_pdf_url: string | null
          opportunity_index: number | null
          opportunity_tier: string | null
          opportunity_tier_label: string | null
          overall_score: number | null
          packaging_type: string | null
          products_analyzed: number | null
          products_snapshot: Json | null
          recommendation: string | null
          recommended_price: number | null
          reviews_analyzed: number | null
          reviews_snapshot: Json | null
          run_id: string | null
          run_number: number | null
          run_timestamp: string | null
          top_strengths: Json | null
          top_weaknesses: Json | null
          weighted_scoring: Json | null
        }
        Insert: {
          analysis_1_category_scores?: Json | null
          analysis_2_opportunity_calculation?: Json | null
          analysis_3_formula_brief?: Json | null
          analysis_date?: string | null
          category_contributions?: Json | null
          category_id?: string | null
          category_name: string
          confidence?: string | null
          created_at?: string | null
          criteria_scores?: Json | null
          estimated_profit_margin?: number | null
          executive_summary?: string | null
          formula_brief?: Json | null
          formula_brief_html?: string | null
          formula_brief_pdf_url?: string | null
          id?: string
          key_insights?: Json | null
          market_analysis_html?: string | null
          market_analysis_pdf_url?: string | null
          opportunity_index?: number | null
          opportunity_tier?: string | null
          opportunity_tier_label?: string | null
          overall_score?: number | null
          packaging_type?: string | null
          products_analyzed?: number | null
          products_snapshot?: Json | null
          recommendation?: string | null
          recommended_price?: number | null
          reviews_analyzed?: number | null
          reviews_snapshot?: Json | null
          run_id?: string | null
          run_number?: number | null
          run_timestamp?: string | null
          top_strengths?: Json | null
          top_weaknesses?: Json | null
          weighted_scoring?: Json | null
        }
        Update: {
          analysis_1_category_scores?: Json | null
          analysis_2_opportunity_calculation?: Json | null
          analysis_3_formula_brief?: Json | null
          analysis_date?: string | null
          category_contributions?: Json | null
          category_id?: string | null
          category_name?: string
          confidence?: string | null
          created_at?: string | null
          criteria_scores?: Json | null
          estimated_profit_margin?: number | null
          executive_summary?: string | null
          formula_brief?: Json | null
          formula_brief_html?: string | null
          formula_brief_pdf_url?: string | null
          id?: string
          key_insights?: Json | null
          market_analysis_html?: string | null
          market_analysis_pdf_url?: string | null
          opportunity_index?: number | null
          opportunity_tier?: string | null
          opportunity_tier_label?: string | null
          overall_score?: number | null
          packaging_type?: string | null
          products_analyzed?: number | null
          products_snapshot?: Json | null
          recommendation?: string | null
          recommended_price?: number | null
          reviews_analyzed?: number | null
          reviews_snapshot?: Json | null
          run_id?: string | null
          run_number?: number | null
          run_timestamp?: string | null
          top_strengths?: Json | null
          top_weaknesses?: Json | null
          weighted_scoring?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "category_analyses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_analyses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      category_scores: {
        Row: {
          analysis_date: string | null
          branding_difficulty: number | null
          breakout_score: number | null
          category_id: string | null
          competition_score: number | null
          consumer_fit: number | null
          created_at: string | null
          demand_score: number | null
          differentiation_potential: number | null
          flavor_complexity: number | null
          formulation_difficulty: number | null
          id: string
          key_insights: string[] | null
          manufacturing_access: number | null
          marketing_difficulty: number | null
          operational_complexity: number | null
          opportunity_index: number | null
          pain_points_score: number | null
          production_complexity: number | null
          profitability: number | null
          quality_difficulty: number | null
          recommendation: string | null
          regulatory_risk: number | null
          supply_chain_risk: number | null
          top_pain_points: string[] | null
          trust_level: number | null
        }
        Insert: {
          analysis_date?: string | null
          branding_difficulty?: number | null
          breakout_score?: number | null
          category_id?: string | null
          competition_score?: number | null
          consumer_fit?: number | null
          created_at?: string | null
          demand_score?: number | null
          differentiation_potential?: number | null
          flavor_complexity?: number | null
          formulation_difficulty?: number | null
          id?: string
          key_insights?: string[] | null
          manufacturing_access?: number | null
          marketing_difficulty?: number | null
          operational_complexity?: number | null
          opportunity_index?: number | null
          pain_points_score?: number | null
          production_complexity?: number | null
          profitability?: number | null
          quality_difficulty?: number | null
          recommendation?: string | null
          regulatory_risk?: number | null
          supply_chain_risk?: number | null
          top_pain_points?: string[] | null
          trust_level?: number | null
        }
        Update: {
          analysis_date?: string | null
          branding_difficulty?: number | null
          breakout_score?: number | null
          category_id?: string | null
          competition_score?: number | null
          consumer_fit?: number | null
          created_at?: string | null
          demand_score?: number | null
          differentiation_potential?: number | null
          flavor_complexity?: number | null
          formulation_difficulty?: number | null
          id?: string
          key_insights?: string[] | null
          manufacturing_access?: number | null
          marketing_difficulty?: number | null
          operational_complexity?: number | null
          opportunity_index?: number | null
          pain_points_score?: number | null
          production_complexity?: number | null
          profitability?: number | null
          quality_difficulty?: number | null
          recommendation?: string | null
          regulatory_risk?: number | null
          supply_chain_risk?: number | null
          top_pain_points?: string[] | null
          trust_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "category_scores_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_scores_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      competitive_analyses: {
        Row: {
          analysis: Json
          category_id: string
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          analysis: Json
          category_id: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          analysis?: Json
          category_id?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitive_analyses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitive_analyses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "v_category_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          created_at: string | null
          current_rank: number | null
          current_rating: number | null
          current_reviews: number | null
          days_tracked: number | null
          id: string
          initial_rank: number | null
          initial_rating: number | null
          initial_reviews: number | null
          is_breakout: boolean | null
          last_checked: string | null
          product_id: string | null
          rank_change: number | null
          rating_change: number | null
          review_growth_rate: number | null
          reviews_per_day: number | null
          tracking_start_date: string | null
        }
        Insert: {
          created_at?: string | null
          current_rank?: number | null
          current_rating?: number | null
          current_reviews?: number | null
          days_tracked?: number | null
          id?: string
          initial_rank?: number | null
          initial_rating?: number | null
          initial_reviews?: number | null
          is_breakout?: boolean | null
          last_checked?: string | null
          product_id?: string | null
          rank_change?: number | null
          rating_change?: number | null
          review_growth_rate?: number | null
          reviews_per_day?: number | null
          tracking_start_date?: string | null
        }
        Update: {
          created_at?: string | null
          current_rank?: number | null
          current_rating?: number | null
          current_reviews?: number | null
          days_tracked?: number | null
          id?: string
          initial_rank?: number | null
          initial_rating?: number | null
          initial_reviews?: number | null
          is_breakout?: boolean | null
          last_checked?: string | null
          product_id?: string | null
          rank_change?: number | null
          rating_change?: number | null
          review_growth_rate?: number | null
          reviews_per_day?: number | null
          tracking_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      formula_briefs: {
        Row: {
          category_id: string | null
          certifications: string[] | null
          cogs_target: number | null
          consumer_pain_points: string[] | null
          created_at: string | null
          flavor_development_needed: boolean | null
          flavor_importance: string | null
          flavor_profile: string | null
          form_rationale: string | null
          form_type: string | null
          id: string
          ingredients: Json | null
          key_differentiators: string[] | null
          lead_time_weeks: number | null
          manufacturing_notes: string | null
          margin_estimate: number | null
          market_summary: string | null
          moq_estimate: number | null
          opportunity_insights: string | null
          packaging_recommendations: string | null
          packaging_type: string | null
          positioning: string | null
          regulatory_notes: string | null
          risk_factors: string[] | null
          servings_per_container: number | null
          target_customer: string | null
          target_price: number | null
          testing_requirements: string[] | null
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          certifications?: string[] | null
          cogs_target?: number | null
          consumer_pain_points?: string[] | null
          created_at?: string | null
          flavor_development_needed?: boolean | null
          flavor_importance?: string | null
          flavor_profile?: string | null
          form_rationale?: string | null
          form_type?: string | null
          id?: string
          ingredients?: Json | null
          key_differentiators?: string[] | null
          lead_time_weeks?: number | null
          manufacturing_notes?: string | null
          margin_estimate?: number | null
          market_summary?: string | null
          moq_estimate?: number | null
          opportunity_insights?: string | null
          packaging_recommendations?: string | null
          packaging_type?: string | null
          positioning?: string | null
          regulatory_notes?: string | null
          risk_factors?: string[] | null
          servings_per_container?: number | null
          target_customer?: string | null
          target_price?: number | null
          testing_requirements?: string[] | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          certifications?: string[] | null
          cogs_target?: number | null
          consumer_pain_points?: string[] | null
          created_at?: string | null
          flavor_development_needed?: boolean | null
          flavor_importance?: string | null
          flavor_profile?: string | null
          form_rationale?: string | null
          form_type?: string | null
          id?: string
          ingredients?: Json | null
          key_differentiators?: string[] | null
          lead_time_weeks?: number | null
          manufacturing_notes?: string | null
          margin_estimate?: number | null
          market_summary?: string | null
          moq_estimate?: number | null
          opportunity_insights?: string | null
          packaging_recommendations?: string | null
          packaging_type?: string | null
          positioning?: string | null
          regulatory_notes?: string | null
          risk_factors?: string[] | null
          servings_per_container?: number | null
          target_customer?: string | null
          target_price?: number | null
          testing_requirements?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formula_briefs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formula_briefs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_analyses: {
        Row: {
          analysis: Json
          category_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          analysis: Json
          category_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          analysis?: Json
          category_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_analyses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_analyses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "v_category_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      nlp_aspects: {
        Row: {
          aspect: string
          created_at: string | null
          frequency: number | null
          id: string
          product_id: string | null
          sample_quotes: string[] | null
          sentiment: string | null
        }
        Insert: {
          aspect: string
          created_at?: string | null
          frequency?: number | null
          id?: string
          product_id?: string | null
          sample_quotes?: string[] | null
          sentiment?: string | null
        }
        Update: {
          aspect?: string
          created_at?: string | null
          frequency?: number | null
          id?: string
          product_id?: string | null
          sample_quotes?: string[] | null
          sentiment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nlp_aspects_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_analyses: {
        Row: {
          analysis: Json
          category_id: string
          created_at: string
          id: string
          mockup_image_url: string | null
          updated_at: string
        }
        Insert: {
          analysis: Json
          category_id: string
          created_at?: string
          id?: string
          mockup_image_url?: string | null
          updated_at?: string
        }
        Update: {
          analysis?: Json
          category_id?: string
          created_at?: string
          id?: string
          mockup_image_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_analyses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_analyses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "v_category_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          age_months: number | null
          all_nutrients: Json | null
          allergen_info: string | null
          amazon_choice: boolean | null
          asin: string
          bestseller: boolean | null
          brand: string | null
          bsr_30_days_avg: number | null
          bsr_90_days_avg: number | null
          bsr_category: string | null
          bsr_current: number | null
          bsr_primary: number | null
          bullets_count: number | null
          calories_per_serving: number | null
          categories_flat: string | null
          category_id: string | null
          category_tree: Json | null
          claims: string | null
          claims_on_label: string[] | null
          created_at: string | null
          current_price: number | null
          date_first_available: string | null
          description_length: number | null
          description_text: string | null
          dimensions: string | null
          directions: string | null
          estimated_monthly_sales: number | null
          estimated_revenue: number | null
          extraction_notes: string | null
          feature_bullets: string[] | null
          feature_bullets_text: string | null
          fees_estimate: number | null
          flavor_options: string[] | null
          has_a_plus_content: boolean | null
          has_proprietary_blends: boolean | null
          historical_data: Json | null
          id: string
          image_url: string | null
          image_urls: string[] | null
          images_count: number | null
          important_information: Json | null
          ingredients: string | null
          is_available: boolean | null
          is_fba: boolean | null
          is_young_competitor: boolean | null
          keyword_rank: Json | null
          last_updated: string | null
          launch_date: string | null
          listing_since: string | null
          lqs: number | null
          main_image_url: string | null
          manufacturer: string | null
          manufacturer_from_label: string | null
          marketing_analysis: Json | null
          marketing_analysis_updated_at: string | null
          monthly_revenue: number | null
          monthly_sales: number | null
          net_estimate: number | null
          nutrients_count: number | null
          ocr_confidence: string | null
          ocr_extracted: boolean | null
          other_ingredients: string | null
          packaging_type: string | null
          parent_asin: string | null
          ppc_bid_estimate: number | null
          price: number | null
          price_30_days_avg: number | null
          price_90_days_avg: number | null
          price_current: number | null
          product_url: string | null
          proprietary_blends: Json | null
          rank: number | null
          rating: number | null
          rating_count: number | null
          rating_value: number | null
          recent_sales: string | null
          review_analysis: Json | null
          review_analysis_updated_at: string | null
          reviews: number | null
          seller_name: string | null
          seller_type: string | null
          serving_size: string | null
          servings_per_container: number | null
          specifications: Json | null
          supplement_facts_complete: Json | null
          supplement_facts_raw: string | null
          title: string | null
          unit_price_text: string | null
          unit_price_value: number | null
          updated_at: string | null
          variations_count: number | null
          video_count: number | null
          video_urls: string[] | null
          warnings: string | null
          weight: string | null
          workflow_run_id: string | null
        }
        Insert: {
          age_months?: number | null
          all_nutrients?: Json | null
          allergen_info?: string | null
          amazon_choice?: boolean | null
          asin: string
          bestseller?: boolean | null
          brand?: string | null
          bsr_30_days_avg?: number | null
          bsr_90_days_avg?: number | null
          bsr_category?: string | null
          bsr_current?: number | null
          bsr_primary?: number | null
          bullets_count?: number | null
          calories_per_serving?: number | null
          categories_flat?: string | null
          category_id?: string | null
          category_tree?: Json | null
          claims?: string | null
          claims_on_label?: string[] | null
          created_at?: string | null
          current_price?: number | null
          date_first_available?: string | null
          description_length?: number | null
          description_text?: string | null
          dimensions?: string | null
          directions?: string | null
          estimated_monthly_sales?: number | null
          estimated_revenue?: number | null
          extraction_notes?: string | null
          feature_bullets?: string[] | null
          feature_bullets_text?: string | null
          fees_estimate?: number | null
          flavor_options?: string[] | null
          has_a_plus_content?: boolean | null
          has_proprietary_blends?: boolean | null
          historical_data?: Json | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          images_count?: number | null
          important_information?: Json | null
          ingredients?: string | null
          is_available?: boolean | null
          is_fba?: boolean | null
          is_young_competitor?: boolean | null
          keyword_rank?: Json | null
          last_updated?: string | null
          launch_date?: string | null
          listing_since?: string | null
          lqs?: number | null
          main_image_url?: string | null
          manufacturer?: string | null
          manufacturer_from_label?: string | null
          marketing_analysis?: Json | null
          marketing_analysis_updated_at?: string | null
          monthly_revenue?: number | null
          monthly_sales?: number | null
          net_estimate?: number | null
          nutrients_count?: number | null
          ocr_confidence?: string | null
          ocr_extracted?: boolean | null
          other_ingredients?: string | null
          packaging_type?: string | null
          parent_asin?: string | null
          ppc_bid_estimate?: number | null
          price?: number | null
          price_30_days_avg?: number | null
          price_90_days_avg?: number | null
          price_current?: number | null
          product_url?: string | null
          proprietary_blends?: Json | null
          rank?: number | null
          rating?: number | null
          rating_count?: number | null
          rating_value?: number | null
          recent_sales?: string | null
          review_analysis?: Json | null
          review_analysis_updated_at?: string | null
          reviews?: number | null
          seller_name?: string | null
          seller_type?: string | null
          serving_size?: string | null
          servings_per_container?: number | null
          specifications?: Json | null
          supplement_facts_complete?: Json | null
          supplement_facts_raw?: string | null
          title?: string | null
          unit_price_text?: string | null
          unit_price_value?: number | null
          updated_at?: string | null
          variations_count?: number | null
          video_count?: number | null
          video_urls?: string[] | null
          warnings?: string | null
          weight?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          age_months?: number | null
          all_nutrients?: Json | null
          allergen_info?: string | null
          amazon_choice?: boolean | null
          asin?: string
          bestseller?: boolean | null
          brand?: string | null
          bsr_30_days_avg?: number | null
          bsr_90_days_avg?: number | null
          bsr_category?: string | null
          bsr_current?: number | null
          bsr_primary?: number | null
          bullets_count?: number | null
          calories_per_serving?: number | null
          categories_flat?: string | null
          category_id?: string | null
          category_tree?: Json | null
          claims?: string | null
          claims_on_label?: string[] | null
          created_at?: string | null
          current_price?: number | null
          date_first_available?: string | null
          description_length?: number | null
          description_text?: string | null
          dimensions?: string | null
          directions?: string | null
          estimated_monthly_sales?: number | null
          estimated_revenue?: number | null
          extraction_notes?: string | null
          feature_bullets?: string[] | null
          feature_bullets_text?: string | null
          fees_estimate?: number | null
          flavor_options?: string[] | null
          has_a_plus_content?: boolean | null
          has_proprietary_blends?: boolean | null
          historical_data?: Json | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          images_count?: number | null
          important_information?: Json | null
          ingredients?: string | null
          is_available?: boolean | null
          is_fba?: boolean | null
          is_young_competitor?: boolean | null
          keyword_rank?: Json | null
          last_updated?: string | null
          launch_date?: string | null
          listing_since?: string | null
          lqs?: number | null
          main_image_url?: string | null
          manufacturer?: string | null
          manufacturer_from_label?: string | null
          marketing_analysis?: Json | null
          marketing_analysis_updated_at?: string | null
          monthly_revenue?: number | null
          monthly_sales?: number | null
          net_estimate?: number | null
          nutrients_count?: number | null
          ocr_confidence?: string | null
          ocr_extracted?: boolean | null
          other_ingredients?: string | null
          packaging_type?: string | null
          parent_asin?: string | null
          ppc_bid_estimate?: number | null
          price?: number | null
          price_30_days_avg?: number | null
          price_90_days_avg?: number | null
          price_current?: number | null
          product_url?: string | null
          proprietary_blends?: Json | null
          rank?: number | null
          rating?: number | null
          rating_count?: number | null
          rating_value?: number | null
          recent_sales?: string | null
          review_analysis?: Json | null
          review_analysis_updated_at?: string | null
          reviews?: number | null
          seller_name?: string | null
          seller_type?: string | null
          serving_size?: string | null
          servings_per_container?: number | null
          specifications?: Json | null
          supplement_facts_complete?: Json | null
          supplement_facts_raw?: string | null
          title?: string | null
          unit_price_text?: string | null
          unit_price_value?: number | null
          updated_at?: string | null
          variations_count?: number | null
          video_count?: number | null
          video_urls?: string[] | null
          warnings?: string | null
          weight?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          asin: string | null
          body: string | null
          category_id: string | null
          collected_at: string | null
          created_at: string | null
          helpful_votes: number | null
          id: number
          product_id: string | null
          rating: number | null
          review_batch_id: string | null
          review_date: string | null
          review_id: string | null
          run_timestamp: string | null
          title: string | null
          verified_purchase: boolean | null
          workflow_run_id: string | null
        }
        Insert: {
          asin?: string | null
          body?: string | null
          category_id?: string | null
          collected_at?: string | null
          created_at?: string | null
          helpful_votes?: number | null
          id?: number
          product_id?: string | null
          rating?: number | null
          review_batch_id?: string | null
          review_date?: string | null
          review_id?: string | null
          run_timestamp?: string | null
          title?: string | null
          verified_purchase?: boolean | null
          workflow_run_id?: string | null
        }
        Update: {
          asin?: string | null
          body?: string | null
          category_id?: string | null
          collected_at?: string | null
          created_at?: string | null
          helpful_votes?: number | null
          id?: number
          product_id?: string | null
          rating?: number | null
          review_batch_id?: string | null
          review_date?: string | null
          review_id?: string | null
          run_timestamp?: string | null
          title?: string | null
          verified_purchase?: boolean | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_reviews_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reviews_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_breakout_competitors: {
        Row: {
          age_months: number | null
          asin: string | null
          brand: string | null
          category_name: string | null
          current_reviews: number | null
          days_tracked: number | null
          initial_reviews: number | null
          price: number | null
          rating: number | null
          review_growth_rate: number | null
          reviews: number | null
          reviews_gained: number | null
          reviews_per_day: number | null
          title: string | null
        }
        Relationships: []
      }
      v_category_dashboard: {
        Row: {
          analysis_date: string | null
          avg_price: number | null
          avg_rating: number | null
          breakout_score: number | null
          category_name: string | null
          competition_score: number | null
          demand_score: number | null
          id: string | null
          last_scanned: string | null
          max_price: number | null
          max_reviews: number | null
          min_price: number | null
          opportunity_index: number | null
          recommendation: string | null
          search_term: string | null
          total_products: number | null
          total_reviews: number | null
          unique_brands: number | null
          young_competitors: number | null
        }
        Relationships: []
      }
      v_category_sales: {
        Row: {
          avg_monthly_revenue: number | null
          avg_monthly_sales: number | null
          avg_price: number | null
          category_name: string | null
          max_monthly_revenue: number | null
          max_monthly_sales: number | null
          products_above_2x_avg: number | null
          sales_75th_percentile: number | null
          sales_90th_percentile: number | null
          total_monthly_revenue: number | null
          total_monthly_sales: number | null
          total_products: number | null
        }
        Relationships: []
      }
      v_formula_briefs_summary: {
        Row: {
          category_name: string | null
          cogs_target: number | null
          created_at: string | null
          flavor_importance: string | null
          form_type: string | null
          key_differentiators: string[] | null
          margin_estimate: number | null
          opportunity_index: number | null
          positioning: string | null
          recommendation: string | null
          target_price: number | null
        }
        Relationships: []
      }
      v_pain_points_by_category: {
        Row: {
          aspect: string | null
          avg_product_rating: number | null
          category_name: string | null
          example_quotes: string[] | null
          products_affected: number | null
          sentiment: string | null
          total_mentions: number | null
        }
        Relationships: []
      }
      v_revenue_opportunities: {
        Row: {
          annual_revenue_estimate: number | null
          annual_units_estimate: number | null
          asin: string | null
          brand: string | null
          bsr_current: number | null
          category_name: string | null
          is_young_competitor: boolean | null
          lqs: number | null
          monthly_revenue: number | null
          monthly_sales: number | null
          price: number | null
          rating: number | null
          revenue_per_unit: number | null
          reviews: number | null
          title: string | null
          volume_category: string | null
        }
        Relationships: []
      }
      v_top_products: {
        Row: {
          amazon_choice: boolean | null
          asin: string | null
          bestseller: boolean | null
          brand: string | null
          category_name: string | null
          is_young_competitor: boolean | null
          price: number | null
          rank: number | null
          rating: number | null
          reviews: number | null
          reviews_per_month: number | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_next_run_number: { Args: { p_category_id: string }; Returns: number }
      upsert_category: {
        Args: {
          p_amazon_categories: string[]
          p_name: string
          p_search_term: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
