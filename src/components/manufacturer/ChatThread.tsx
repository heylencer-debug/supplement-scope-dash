/**
 * ChatThread — the shared internals of the Manufacturer/Formulator chat
 * agent: message list (with change-card approve/reject), composer, realtime
 * subscription + polling, and the migration-pending empty state.
 *
 * Extracted out of ManufacturerChat.tsx so the SAME thread can be hosted in
 * two places without duplicating the query/mutation logic:
 *   - <ManufacturerChat> — a fixed-chrome card (still used by
 *     ManufacturerPortalInternal.tsx's Chat tab).
 *   - <FormulatorAgent> — the floating bottom-right agent mounted once at
 *     the Layout level, following the currently-selected category across
 *     every tab/page.
 *
 * Callers own sizing/chrome (header, height, card border) — this component
 * renders header + scrollable thread + composer as one flex column that
 * fills its parent's height (`h-full min-h-0`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bot,
  Send,
  User,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Loader2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MarkdownDoc } from "@/lib/markdownDoc";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_RAW_BYTES = 10 * 1024 * 1024; // 10MB raw (~13MB base64)
const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

interface StagedAttachment {
  id: string;
  kind: "image" | "pdf";
  filename: string;
  data_url: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export interface ChangeCardChange {
  target: string;
  from: string;
  to: string;
  reason: string;
}

export interface ChangeCard {
  title: string;
  rationale: string;
  changes: ChangeCardChange[];
  impact: string;
  risk_level: "low" | "medium" | "high";
}

export interface ChatMessageRow {
  id: string;
  category_id: string;
  session_token: string | null;
  role: "user" | "manufacturer" | "agent";
  content: string | null;
  change_card: ChangeCard | null;
  card_status: "proposed" | "approved" | "rejected" | "applied" | null;
  created_at: string;
}

export interface ChatThreadProps {
  categoryId: string;
  keyword: string;
  /** Extra classes on the outer flex column (header + thread + composer). */
  className?: string;
  /** Hide the built-in header band — for hosts that render their own. */
  hideHeader?: boolean;
  /** Fires whenever the latest row is a fresh non-user message — lets a
   * host (e.g. the floating agent's launcher) show an unread indicator. */
  onLatestMessage?: (message: ChatMessageRow) => void;
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
          <div className="rounded-lg border border-border/60 overflow-x-auto">
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
          // 'approved' now means "background revision in flight OR it failed
          // the audit" (async flow) — spinner alone would spin forever after
          // an audit failure, so always offer the retry path (re-deciding an
          // approved card is the server's built-in retry).
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Approved — revision in progress
            </Badge>
            <button
              type="button"
              onClick={() => onDecide("approved")}
              className="text-[10px] font-semibold text-primary hover:underline"
            >
              Retry revision
            </button>
          </div>
        )}
        {status === "rejected" && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Rejected</Badge>
        )}
        {status === "applied" && (
          <Badge variant="success" className="text-[10px]">
            Applied — see Formula Versions
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
      <div className={cn("min-w-0 max-w-[85%] overflow-hidden", isUser ? "items-end" : "items-start", "flex flex-col")}>
        {message.content && (
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-full min-w-0 overflow-hidden break-words",
              isUser ? "bg-primary/10 text-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"
            )}
          >
            {message.content.includes("[attached:") && (
              <Paperclip className="w-3 h-3 text-muted-foreground mb-1 inline-block" />
            )}
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

export function ChatThread({ categoryId, keyword, className, hideHeader, onLatestMessage }: ChatThreadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastNotifiedId = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Notify the host of the latest non-user message (once per row) — the
  // floating launcher uses this to light an unread dot while its panel is
  // closed.
  useEffect(() => {
    if (!onLatestMessage || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "agent" && last.id !== lastNotifiedId.current) {
      lastNotifiedId.current = last.id;
      onLatestMessage(last);
    }
  }, [messages, onLatestMessage]);

  const sendMutation = useMutation({
    mutationFn: async ({ message, files }: { message: string; files: StagedAttachment[] }) => {
      const { data, error } = await supabase.functions.invoke("manufacturer-chat", {
        body: {
          category_id: categoryId,
          message,
          ...(files.length
            ? { attachments: files.map(({ kind, filename, data_url }) => ({ kind, filename, data_url })) }
            : {}),
        },
      });
      if (error) throw error;
      if (data?.code === "TABLE_MISSING") throw Object.assign(new Error(data.error), { code: "TABLE_MISSING" });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setDraft("");
      setAttachments([]);
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
    sendMutation.mutate({ message: trimmed, files: attachments });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    const input = fileInputRef.current;
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);

    const oversized = incoming.filter((f) => f.size > MAX_ATTACHMENT_RAW_BYTES);
    const withinSize = incoming.filter((f) => f.size <= MAX_ATTACHMENT_RAW_BYTES);
    if (oversized.length > 0) {
      toast({
        title: "File too large",
        description: `${oversized.map((f) => f.name).join(", ")} exceed${oversized.length === 1 ? "s" : ""} the 10MB limit and ${oversized.length === 1 ? "was" : "were"} skipped.`,
        variant: "destructive",
      });
    }

    const roomLeft = MAX_ATTACHMENTS - attachments.length;
    if (roomLeft <= 0) {
      toast({
        title: "Attachment limit reached",
        description: "You can attach up to 5 files per message.",
        variant: "destructive",
      });
      if (input) input.value = "";
      return;
    }

    const accepted = withinSize.slice(0, roomLeft);
    if (withinSize.length > accepted.length) {
      toast({
        title: "Attachment limit reached",
        description: "You can attach up to 5 files per message — extra files were skipped.",
        variant: "destructive",
      });
    }

    const staged: StagedAttachment[] = [];
    for (const file of accepted) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        staged.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          kind: file.type === "application/pdf" ? "pdf" : "image",
          filename: file.name,
          data_url: dataUrl,
        });
      } catch {
        toast({ title: "Couldn't read file", description: file.name, variant: "destructive" });
      }
    }

    if (staged.length > 0) setAttachments((prev) => [...prev, ...staged]);
    if (input) input.value = "";
  };

  if (migrationPending) {
    return (
      <div className={cn("flex flex-col h-full min-h-0", className)}>
        <div className="rounded-[var(--radius)] border border-dashed border-border bg-muted/20 p-6 flex items-start gap-3 m-4">
          <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Manufacturer chat not enabled yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Migration <code className="text-[11px] bg-muted px-1 py-0.5 rounded">006_manufacturer_chat.sql</code> hasn't been applied to this Supabase project yet. Once it is, this panel will turn into a live chat thread grounded in the full formula, QA, benchmarking, and compliance documents for {keyword}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      {!hideHeader && (
        <div className="shrink-0 px-5 py-3.5 bg-muted/40 border-b border-border flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Manufacturer Chat Agent</p>
            <p className="text-xs text-muted-foreground truncate">
              Grounded in the full formula, QA, benchmarking, and compliance documents for {keyword}
            </p>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-5 space-y-5">
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

      <div className="shrink-0 border-t border-border p-3 space-y-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-muted border border-border/60 text-xs text-foreground max-w-[180px]"
              >
                {a.kind === "pdf" ? (
                  <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ImageIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                )}
                <span className="truncate">{a.filename}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  disabled={sendMutation.isPending}
                  className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-background/60"
                  aria-label={`Remove ${a.filename}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-foreground"
            disabled={sendMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
            title="Attach an image or PDF"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
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
    </div>
  );
}

export default ChatThread;
