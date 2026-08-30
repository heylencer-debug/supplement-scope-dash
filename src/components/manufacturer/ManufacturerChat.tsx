/**
 * ManufacturerChat — the real running chat agent for a category's formula.
 *
 * Additive to (and independent of) the existing one-shot manufacturer_feedback
 * + <ManufacturerFeedback> flow, which is untouched. This talks to the new
 * `manufacturer-chat` edge function, which sees the FULL document corpus for
 * the category (formula brief, QA report, P11 benchmarking, P12 compliance,
 * P13 sign-off) and replies either in plain text or with a proposed
 * "change card" that a human must Approve/Reject before anything is applied
 * to the formula. Approved cards land as a NEW row in the existing
 * formula_brief_versions system — the exact mechanism
 * process-manufacturer-feedback already uses — never as a silent edit.
 *
 * Backed by `manufacturer_chat_messages`, created by
 * scout/migrations/006_manufacturer_chat.sql. Until that migration is
 * applied, every query against the table fails with Postgres 42P01 /
 * PostgREST PGRST205 ("relation/table does not exist") — this component
 * detects that and renders a clear "chat not enabled yet" panel instead of
 * crashing or looping on errors.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bot, Send, User, AlertTriangle, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MarkdownDoc } from "@/lib/markdownDoc";
import { cn } from "@/lib/utils";

interface ChangeCardChange {
  target: string;
  from: string;
  to: string;
  reason: string;
}

interface ChangeCard {
  title: string;
  rationale: string;
  changes: ChangeCardChange[];
  impact: string;
  risk_level: "low" | "medium" | "high";
}

interface ChatMessageRow {
  id: string;
  category_id: string;
  session_token: string | null;
  role: "user" | "manufacturer" | "agent";
  content: string | null;
  change_card: ChangeCard | null;
  card_status: "proposed" | "approved" | "rejected" | "applied" | null;
  created_at: string;
}

interface ManufacturerChatProps {
  categoryId: string;
  keyword: string;
}

/** Table doesn't exist yet (migration 006 not applied) — normalize every
 * shape Postgres/PostgREST might report this as. */
function isTableMissingError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { code?: string; message?: string };
  const message = (err.message || "").toLowerCase();
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    err.code === "TABLE_MISSING" ||
    message.includes("42p01") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}

const RISK_BADGE: Record<ChangeCard["risk_level"], { variant: "secondary" | "warning" | "destructive"; label: string }> = {
  low: { variant: "secondary", label: "Low risk" },
  medium: { variant: "warning", label: "Medium risk" },
  high: { variant: "destructive", label: "High risk" },
};

function ChangeCardPanel({
  message,
  onDecide,
  isDeciding,
}: {
  message: ChatMessageRow;
  onDecide: (decision: "approved" | "rejected") => void;
  isDeciding: boolean;
}) {
  const card = message.change_card;
  if (!card) return null;
  const risk = RISK_BADGE[card.risk_level] ?? RISK_BADGE.medium;
  const status = message.card_status;

  return (
    <div className="mt-2 rounded-[var(--radius)] border border-border bg-card shadow-sm overflow-hidden max-w-[560px]">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground truncate">{card.title}</p>
        </div>
        <Badge variant={risk.variant} className="text-[10px] flex-shrink-0">{risk.label}</Badge>
      </div>

      <div className="px-4 py-3 space-y-3">
        {card.rationale && (
          <p className="text-xs text-muted-foreground leading-relaxed">{card.rationale}</p>
        )}

        {card.changes?.length > 0 && (
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Target</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">From</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground w-4"></th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {card.changes.map((c, i) => (
                  <tr key={i}>
                    <td className="px-2.5 py-1.5 align-top font-medium text-foreground">{c.target}</td>
                    <td className="px-2.5 py-1.5 align-top text-muted-foreground">{c.from}</td>
                    <td className="px-1 py-1.5 align-top text-muted-foreground/50"><ArrowRight className="w-3 h-3" /></td>
                    <td className="px-2.5 py-1.5 align-top text-foreground">{c.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {card.changes.some((c) => c.reason) && (
              <div className="px-2.5 py-2 border-t border-border/40 bg-muted/10 space-y-1">
                {card.changes.filter((c) => c.reason).map((c, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">{c.target}:</span> {c.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {card.impact && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Impact</p>
            <p className="text-xs text-foreground/90 leading-relaxed">{card.impact}</p>
          </div>
        )}

        {status === "proposed" && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs gap-1.5"
              disabled={isDeciding}
              onClick={() => onDecide("approved")}
            >
              {isDeciding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              disabled={isDeciding}
              onClick={() => onDecide("rejected")}
            >
              Reject
            </Button>
          </div>
        )}
        {status === "approved" && (
          <Badge variant="outline" className="text-[10px] gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Approved — generating revision…
          </Badge>
        )}
        {status === "rejected" && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Rejected</Badge>
        )}
        {status === "applied" && (
          <Badge variant="success" className="text-[10px]">
            Applied — see Formula Brief Versions below
          </Badge>
        )}
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  onDecide,
  decidingId,
}: {
  message: ChatMessageRow;
  onDecide: (messageId: string, decision: "approved" | "rejected") => void;
  decidingId: string | null;
}) {
  const isUser = message.role === "user" || message.role === "manufacturer";

  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
          isUser ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={cn("min-w-0 max-w-[75%]", isUser ? "items-end" : "items-start", "flex flex-col")}>
        {message.content && (
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              isUser ? "bg-primary/10 text-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"
            )}
          >
            <MarkdownDoc content={message.content} className="text-sm [&_p]:my-1 [&_p]:leading-relaxed" />
          </div>
        )}
        {message.change_card && (
          <ChangeCardPanel
            message={message}
            isDeciding={decidingId === message.id}
            onDecide={(decision) => onDecide(message.id, decision)}
          />
        )}
        <span className="text-[10px] text-muted-foreground mt-1 px-1">
          {format(new Date(message.created_at), "MMM d, h:mm a")}
        </span>
      </div>
    </div>
  );
}

export function ManufacturerChat({ categoryId, keyword }: ManufacturerChatProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryKey = useMemo(() => ["manufacturer_chat_messages", categoryId], [categoryId]);

  const messagesQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("manufacturer_chat_messages")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessageRow[];
    },
    enabled: !!categoryId,
    refetchInterval: 5000,
    retry: false,
  });

  const migrationPending = isTableMissingError(messagesQuery.error);
  const messages = messagesQuery.data ?? [];

  // Realtime — mirrors useScoutJobs.ts's postgres_changes pattern. Skipped
  // entirely once we know the table is missing (subscribing to a
  // non-existent table is a harmless no-op, but there's no point trying).
  useEffect(() => {
    if (!categoryId || migrationPending) return;
    const channel = supabase
      .channel(`manufacturer_chat_${categoryId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manufacturer_chat_messages", filter: `category_id=eq.${categoryId}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [categoryId, migrationPending, queryClient, queryKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke("manufacturer-chat", {
        body: { category_id: categoryId, message },
      });
      if (error) throw error;
      if (data?.code === "TABLE_MISSING") throw Object.assign(new Error(data.error), { code: "TABLE_MISSING" });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => {
      if (!isTableMissingError(e)) {
        toast({ title: "Message failed", description: e.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const decideMutation = useMutation({
    mutationFn: async ({ messageId, decision }: { messageId: string; decision: "approved" | "rejected" }) => {
      setDecidingId(messageId);
      const { data, error } = await supabase.functions.invoke("manufacturer-chat", {
        body: { action: "decide", category_id: categoryId, message_id: messageId, decision },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, { decision }) => {
      queryClient.invalidateQueries({ queryKey });
      if (decision === "approved") {
        queryClient.invalidateQueries({ queryKey: ["formula_brief_versions"] });
        queryClient.invalidateQueries({ queryKey: ["formula_brief_active_version"] });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    },
    onSettled: () => {
      setDecidingId(null);
    },
  });

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (migrationPending) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-border bg-muted/20 p-6 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">Manufacturer chat not enabled yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Migration <code className="text-[11px] bg-muted px-1 py-0.5 rounded">006_manufacturer_chat.sql</code> hasn't been applied to this Supabase project yet. Once it is, this panel will turn into a live chat thread grounded in the full formula, QA, benchmarking, and compliance documents for {keyword}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 bg-muted/40 border-b border-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Manufacturer Chat Agent</p>
          <p className="text-xs text-muted-foreground">
            Grounded in the full formula, QA, benchmarking, and compliance documents for {keyword}
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[440px] overflow-y-auto px-4 py-4 space-y-4">
        {messagesQuery.isLoading && (
          <p className="text-xs text-muted-foreground text-center py-6">Loading conversation…</p>
        )}
        {!messagesQuery.isLoading && messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No messages yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Ask about the formula, or request a change — the agent will propose a change card before anything is applied.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} onDecide={(id, decision) => decideMutation.mutate({ messageId: id, decision })} decidingId={decidingId} />
        ))}
        {sendMutation.isPending && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the formula, or request a change…"
          rows={2}
          className="text-sm resize-none flex-1"
          disabled={sendMutation.isPending}
        />
        <Button
          size="sm"
          className="h-9 gap-1.5 flex-shrink-0"
          disabled={!draft.trim() || sendMutation.isPending}
          onClick={handleSend}
        >
          {sendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send
        </Button>
      </div>
    </div>
  );
}

export default ManufacturerChat;
