/**
 * PortalFeedbackDisclosure — a compact, collapsed-by-default read-out of
 * everything the old ManufacturerFeedback list used to surface on the
 * Dashboard's Manufacturer tab: manufacturer-submitted portal comments
 * (`manufacturer_comments`, written from /mfr/:token) and internal
 * feedback submissions with their Claude verdicts (`manufacturer_feedback`,
 * written by process-manufacturer-feedback). Neither the submit form nor
 * the Claude-evaluation detail view is reproduced here — that full
 * workflow is redundant with the chat agent now and stays reachable via
 * ManufacturerPortalInternal.tsx ("Manage in portal"). This is purely so
 * the data itself never becomes unreachable from this tab.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PortalFeedbackDisclosureProps {
  categoryId: string;
}

interface FeedItem {
  key: string;
  createdAt: string;
  summary: string;
}

export function PortalFeedbackDisclosure({ categoryId }: PortalFeedbackDisclosureProps) {
  const [open, setOpen] = useState(false);

  const { data: portalComments = [] } = useQuery({
    queryKey: ["manufacturer_comments_portal", categoryId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("manufacturer_comments")
        .select("id, author_name, comment, created_at")
        .eq("category_id", categoryId)
        .neq("session_token", "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: false });
      return (data ?? []) as { id: string; author_name: string; comment: string | null; created_at: string }[];
    },
    enabled: !!categoryId,
  });

  const { data: feedbackList = [] } = useQuery({
    queryKey: ["manufacturer_feedback", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufacturer_feedback" as any)
        .select("id, feedback_text, submitted_at, claude_verdict")
        .eq("category_id", categoryId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data as unknown) as { id: string; feedback_text: string | null; submitted_at: string; claude_verdict: string | null }[];
    },
    enabled: !!categoryId,
  });

  const items: FeedItem[] = useMemo(() => {
    const fromComments: FeedItem[] = portalComments.map((c) => ({
      key: `comment-${c.id}`,
      createdAt: c.created_at,
      summary: `${c.author_name || "Manufacturer"}: ${c.comment || "(file attachment)"}`,
    }));
    const fromFeedback: FeedItem[] = feedbackList.map((f) => ({
      key: `feedback-${f.id}`,
      createdAt: f.submitted_at,
      summary: `${f.feedback_text || "(image feedback)"}${f.claude_verdict ? ` — ${f.claude_verdict.replace(/_/g, " ")}` : ""}`,
    }));
    return [...fromComments, ...fromFeedback].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [portalComments, feedbackList]);

  return (
    <div className="rounded-[var(--radius)] border border-border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Portal feedback ({items.length})</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className={cn("border-t border-border", items.length > 0 && "max-h-64 overflow-y-auto")}>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-4 py-4">No portal feedback yet for this category.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {items.map((item) => (
                <div key={item.key} className="px-4 py-2.5">
                  <p className="text-[10px] text-muted-foreground">{format(new Date(item.createdAt), "MMM d, h:mm a")}</p>
                  <p className="text-xs text-foreground/90 line-clamp-1 mt-0.5">{item.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PortalFeedbackDisclosure;
