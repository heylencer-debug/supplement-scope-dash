

# Plan: Fix Formula Fit Analysis Not Updating After Adding New Products

## Problem Summary

When a user adds a new product (like LMNT) and clicks "Refresh" on the Formula Fit tab, the new analysis is triggered but the UI immediately shows the old cached results instead of waiting for the new analysis to complete.

## Root Cause Analysis

The issue is a **race condition** in `src/hooks/useFormulaFitAnalysis.ts`:

1. User clicks "Refresh" button
2. `triggerAnalysisMutation` calls the edge function
3. Edge function creates a new record with `status: "pending"` and returns `{status: "processing", id: "new-id"}`
4. `onSuccess` sets `isPolling: true` and calls `refetch()`
5. **Problem**: `refetch()` immediately returns the OLD analysis record from cache/stale query
6. The polling `useEffect` sees `status === "completed"` on the OLD record
7. Polling stops immediately - user never sees new analysis

The mutation returns the new analysis ID, but this information is **not used** to query specifically for that new record.

## Solution

Modify the hook to track the newly triggered analysis ID and ensure polling waits for that specific analysis to complete:

### Step 1: Track the triggered analysis ID

Store the `id` returned from the edge function and use it to:
- Query specifically for that analysis record during polling
- OR invalidate the cache and ensure fresh data

### Step 2: Invalidate React Query cache before refetching

After triggering a new analysis, invalidate the query cache to force a fresh fetch from the database.

### Step 3: Add a small delay before first refetch

Give the database time to replicate the new record before polling.

## Implementation Details

### File: `src/hooks/useFormulaFitAnalysis.ts`

**Changes:**

1. Add state to track the newly triggered analysis ID:
   ```typescript
   const [triggeredAnalysisId, setTriggeredAnalysisId] = useState<string | null>(null);
   ```

2. Modify the query to fetch by ID when we have a triggered analysis:
   ```typescript
   queryFn: async () => {
     if (!categoryId) return null;
     
     // If we're waiting for a specific triggered analysis, fetch by ID
     if (triggeredAnalysisId && pollingStatus.isPolling) {
       const { data, error } = await supabase
         .from("formula_fit_analyses")
         .select("*")
         .eq("id", triggeredAnalysisId)
         .single();
       if (error) throw error;
       return data;
     }

     // Default: fetch the latest analysis for this category
     const { data, error } = await supabase
       .from("formula_fit_analyses")
       .select("*")
       .eq("category_id", categoryId)
       .order("created_at", { ascending: false })
       .limit(1)
       .maybeSingle();

     if (error) throw error;
     return data;
   }
   ```

3. Update `onSuccess` to store the new analysis ID and invalidate cache:
   ```typescript
   onSuccess: (data) => {
     // Store the ID of the newly triggered analysis
     setTriggeredAnalysisId(data.id);
     // Invalidate the query cache to force fresh fetch
     queryClient.invalidateQueries({ queryKey: ["formula_fit_analysis", categoryId] });
     // Start polling after a brief delay to let DB replicate
     setTimeout(() => {
       setPollingStatus({ isPolling: true, attempt: 0, maxAttempts: 60 });
       refetch();
     }, 500);
   }
   ```

4. Clear the triggered ID when polling completes:
   ```typescript
   useEffect(() => {
     if (!pollingStatus.isPolling) return;

     if (analysisRecord?.status === "completed" || analysisRecord?.status === "error") {
       setPollingStatus((prev) => ({ ...prev, isPolling: false }));
       setTriggeredAnalysisId(null); // Clear the triggered ID
       return;
     }
     // ...
   }, [analysisRecord, pollingStatus.isPolling, ...]);
   ```

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useFormulaFitAnalysis.ts` | Add triggered analysis ID tracking, invalidate cache on trigger, fetch by ID during polling |

## Testing Steps

1. Navigate to an Electrolyte Powder category
2. Click the Formula Fit tab
3. Note the current "Brands Analyzed" section
4. Add a new product (e.g., via Add Product form) with a new brand
5. Return to Formula Fit tab and click "Refresh"
6. Verify the processing state shows (spinning indicator, progress bar)
7. Wait for analysis to complete
8. Verify the new brand appears in "Brands Analyzed" section

