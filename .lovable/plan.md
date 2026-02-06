

# Plan: AI-Powered Supplement Facts Image Upload

## Overview
Add an image upload feature to the Add Product form that uses **Google Gemini 3 Pro** via OpenRouter to analyze uploaded supplement facts images and auto-fill the ingredients form.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     AddProduct.tsx (Frontend)                    │
├─────────────────────────────────────────────────────────────────┤
│  1. User uploads/drops image of supplement facts panel          │
│  2. Image converted to base64                                   │
│  3. Call edge function with base64 image data                   │
│  4. Receive extracted data → auto-populate form fields          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         extract-supplement-image (New Edge Function)            │
├─────────────────────────────────────────────────────────────────┤
│  • Receives base64 image directly (no Supabase storage)         │
│  • Sends to OpenRouter with google/gemini-3-pro-preview         │
│  • Uses tool calling for structured extraction                  │
│  • Returns parsed ingredients, serving size, claims, etc.       │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Create New Edge Function
**File: `supabase/functions/extract-supplement-image/index.ts`**

Create a new edge function that:
- Accepts base64-encoded image data directly (avoids need for storage bucket setup)
- Sends image to OpenRouter's `google/gemini-3-pro-preview` model
- Uses structured tool calling (same pattern as existing `analyze-supplement-facts`)
- Returns extracted data in a format matching the form's `Ingredient[]` interface

Key differences from existing `analyze-supplement-facts`:
- Takes base64 image input instead of productId
- Returns data for form population instead of updating a database record
- Lighter-weight response focused on form auto-fill

### Step 2: Create Image Upload Hook
**File: `src/hooks/useExtractSupplementImage.ts`**

Create a React Query mutation hook that:
- Converts uploaded File to base64
- Calls the new edge function
- Returns typed extraction results
- Handles loading and error states

### Step 3: Update AddProduct Form
**File: `src/pages/AddProduct.tsx`**

Add to the Supplement Facts card:
1. **Drop zone / file input** for image upload (with visual feedback)
2. **Image preview** showing the uploaded image
3. **"Analyze with AI" button** to trigger extraction
4. **Loading state** with spinner during analysis
5. **Auto-population logic** to fill form fields from extraction results:
   - `ingredients[]` → Active Ingredients table
   - `serving_size` → Serving Size field
   - `servings_per_container` → Servings Per Container field
   - `other_ingredients` → Other Ingredients textarea
   - `directions` → Directions textarea
   - `warnings` → Warnings textarea
   - `claims_on_label` → Claims badges

### Step 4: Update config.toml
Add the new edge function configuration with `verify_jwt = false`

## UI/UX Design

```text
┌─────────────────────────────────────────────────────────────────┐
│ Supplement Facts                                                 │
│ Ingredients from the product label                              │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  📷 Upload Supplement Facts Image                           │ │
│ │  ────────────────────────────────────────────────────────── │ │
│ │  [   Drop image here or click to browse   ]  ← Dashed box  │ │
│ │                                                             │ │
│ │  [Preview Image]        [🔄 Analyze with AI]  ← When image │ │
│ │                                              uploaded       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ Serving Size: [1 stick (16g)]    Servings: [30]  ← Auto-filled  │
│                                                                  │
│ Active Ingredients:                     [+ Add Ingredient]       │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ 1. [Sodium]        [500] [mg] [22%]  [🗑]  ← Auto-filled   │  │
│ │ 2. [Potassium]     [380] [mg] [8%]   [🗑]                  │  │
│ │ 3. [Vitamin C]     [100] [mg] [111%] [🗑]                  │  │
│ └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Details

### Edge Function Request/Response

**Request:**
```typescript
{
  imageBase64: string;  // Base64-encoded image data
  mimeType: string;     // "image/jpeg" | "image/png" | "image/webp"
}
```

**Response:**
```typescript
{
  success: boolean;
  confidence: "high" | "medium" | "low";
  data: {
    serving_size: string | null;
    servings_per_container: number | null;
    ingredients: Array<{
      name: string;
      amount: string;
      unit: string;
      daily_value: string | null;
    }>;
    other_ingredients: string | null;
    directions: string | null;
    warnings: string | null;
    claims_on_label: string[];
  };
  extraction_notes: string;
}
```

### Form Auto-Population Logic

When extraction completes successfully:
1. Replace existing ingredients array with extracted ingredients
2. Fill serving size and container fields
3. Populate other ingredients, directions, warnings textareas
4. Add claims as badges
5. Show toast notification with confidence level and ingredient count

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/extract-supplement-image/index.ts` | Create | New edge function for image analysis |
| `src/hooks/useExtractSupplementImage.ts` | Create | React Query mutation for extraction |
| `src/pages/AddProduct.tsx` | Modify | Add image upload UI and auto-fill logic |
| `supabase/config.toml` | Modify | Add function configuration |

## Dependencies

- Uses existing `OPENROUTER_API_KEY` secret (already configured)
- Uses `google/gemini-3-pro-preview` model (per user request)
- No new npm packages needed (uses native File/FileReader APIs)
- No storage bucket setup required (direct base64 transfer)

