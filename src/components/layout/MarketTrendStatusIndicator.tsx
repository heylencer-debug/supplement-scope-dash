import { useEffect, useState } from "react";
import { Check, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { cn } from "@/lib/utils";

type AnalysisStatus = "pending" | "processing" | "completed" | "error" | null;

export function MarketTrendStatusIndicator() {
  const { currentCategoryId } = useCategoryContext();
  const [status, setStatus] = useState<AnalysisStatus>(null);

  useEffect(() => {
    if (!currentCategoryId) {
      setStatus(null);
      return;
    }

    // Fetch initial status
    const fetchStatus = async () => {
      const { data } = await supabase
        .from("market_trend_analyses")
        .select("status")
        .eq("category_id", currentCategoryId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setStatus(data.status as AnalysisStatus);
      } else {
        setStatus(null);
      }
    };

    fetchStatus();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`market-trend-status-${currentCategoryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "market_trend_analyses",
          filter: `category_id=eq.${currentCategoryId}`,
        },
        (payload) => {
          if (payload.new && "status" in payload.new) {
            setStatus(payload.new.status as AnalysisStatus);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentCategoryId]);

  if (!status) return null;

  if (status === "pending" || status === "processing") {
    return (
      <div className="relative flex items-center justify-center ml-auto">
        {/* Pulsing ring effect */}
        <span className="absolute w-5 h-5 rounded-full bg-primary/20 animate-ping" />
        {/* Spinning loader */}
        <Loader2 className="w-4 h-4 text-primary animate-spin relative z-10" />
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="ml-auto flex items-center justify-center">
        <span
          className={cn(
            "flex items-center justify-center w-5 h-5 rounded-full",
            "bg-accent/30 text-accent-foreground",
            "animate-scale-in"
          )}
          style={{ backgroundColor: "hsl(142 76% 36% / 0.2)", color: "hsl(142 76% 36%)" }}
        >
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="ml-auto flex items-center justify-center">
        <span
          className={cn(
            "flex items-center justify-center w-5 h-5 rounded-full",
            "bg-destructive/20 text-destructive",
            "animate-shake"
          )}
        >
          <AlertTriangle className="w-3 h-3" />
        </span>
      </div>
    );
  }

  return null;
}
