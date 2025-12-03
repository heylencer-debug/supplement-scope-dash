import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCompetitorRealtime(categoryId?: string) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (!categoryId) {
      setIsConnected(false);
      return;
    }

    const channel = supabase
      .channel(`competitors-changes-${categoryId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'competitors'
        },
        (payload) => {
          console.log('Competitor change detected:', payload.eventType, payload);
          
          // Invalidate relevant queries to trigger refetch
          queryClient.invalidateQueries({ queryKey: ["competitors_by_category", categoryId] });
          queryClient.invalidateQueries({ queryKey: ["breakout_competitors"] });
          
          setLastUpdate(new Date());
          
          // Show toast notification for updates
          const eventType = payload.eventType;
          if (eventType === 'INSERT') {
            toast.info("New competitor data received", { duration: 3000 });
          } else if (eventType === 'UPDATE') {
            toast.info("Competitor data updated", { duration: 3000 });
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [categoryId, queryClient]);

  return { isConnected, lastUpdate };
}
