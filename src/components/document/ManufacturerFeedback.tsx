import { useState, useCallback, useMemo } from "react";
import { Factory, Upload, Send, CheckCircle, XCircle, HelpCircle, AlertCircle, ChevronDown, ChevronUp, X, Image, Download, Sparkles, Copy, Check, MessageSquare, Clock, ExternalLink, FileText, Eye, Star } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pdf } from "@react-pdf/renderer";
import { StrategyBriefPDF } from "@/components/document/StrategyBriefPDF";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ManufacturerFeedbackProps {
  categoryId: string;
  keyword: string;
  defaultExpanded?: boolean;
}

interface FeedbackRow {
  id: string;
  feedback_text: string | null;
  image_urls: string[];
  status: "pending" | "processing" | "reviewed" | "dismissed";
  submitted_at: string;
  reviewed_at: string | null;
  claude_verdict: "accepted" | "partially_accepted" | "questioned" | "rejected" | null;
  claude_response: string | null;
  claude_changes: any[];
  resulting_version_id: string | null;
}

interface ParsedChange {
  index: number;
  feedbackPoint: string;
  verdict: string;
  reasoning: string;
}

const VERDICT_CONFIG = {
  accepted: { label: "Accepted", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  partially_accepted: { label: "Partially Accepted", icon: AlertCircle, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
  questioned: { label: "Questioned", icon: HelpCircle, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

function parseChangesFromResponse(response: string | null): ParsedChange[] {
  if (!response) return [];
  // Match markdown table rows from the FEEDBACK EVALUATION section
  const tableMatch = response.match(/##\s*FEEDBACK EVALUATION[\s\S]*?\n\|[\s\-|]+\n([\s\S]*?)(?=\n##|\n\n##|$)/i);
  if (!tableMatch) return [];
  
  const rows = tableMatch[1].split("\n").filter(r => r.trim().startsWith("|"));
  return rows.map((row, i) => {
    const cells = row.split("|").map(c => c.trim()).filter(Boolean);
    return {
      index: i,
      feedbackPoint: cells[1] || `Point ${i + 1}`,
      verdict: cells[2] || "unknown",
      reasoning: cells[3] || "",
    };
  }).filter(c => c.feedbackPoint && c.feedbackPoint !== "---");
}

function parseManufacturerReply(response: string | null): string {
  if (!response) return "";
  const match = response.match(/##\s*MANUFACTURER REPLY\s*\n+([\s\S]*?)(?=\n##\s*CHANGE SUMMARY|$)/i);
  return match?.[1]?.trim() || "";
}

export function ManufacturerFeedback({ categoryId, keyword, defaultExpanded = false }: ManufacturerFeedbackProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [feedbackText, setFeedbackText] = useState("");
  const [uploadedImages, setUploadedImages] = useState<{ file: File; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);
  const [selectedChanges, setSelectedChanges] = useState<Record<string, Set<number>>>({});
  const [generatingVersion, setGeneratingVersion] = useState<string | null>(null);
  const [replyEdits, setReplyEdits] = useState<Record<string, string>>({});
  const [copiedReply, setCopiedReply] = useState<string | null>(null);
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);

  // Load all formula brief versions for this category
  const { data: allVersions = [] } = useQuery({
    queryKey: ["formula_brief_versions", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formula_brief_versions")
        .select("*")
        .eq("category_id", categoryId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!categoryId,
  });

  // Load original formula brief from formula_briefs table
  const { data: originalBrief } = useQuery({
    queryKey: ["original_formula_brief", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formula_briefs")
        .select("ingredients, created_at")
        .eq("category_id", categoryId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const content = (data?.ingredients as any)?.final_formula_brief || (data?.ingredients as any)?.adjusted_formula || null;
      return content ? { content, created_at: data?.created_at } : null;
    },
    enabled: !!categoryId,
  });

  const viewingVersion = viewingVersionId ? allVersions.find(v => v.id === viewingVersionId) : null;
  const handleDownloadVersion = useCallback(async (versionId: string) => {
    setDownloadingVersion(versionId);
    try {
      const { data: version, error } = await supabase
        .from("formula_brief_versions")
        .select("formula_brief_content, version_number, created_at")
        .eq("id", versionId)
        .single();
      if (error || !version) throw new Error("Version not found");

      try {
        const blob = await pdf(
          <StrategyBriefPDF
            content={version.formula_brief_content}
            categoryName={keyword}
            createdAt={version.created_at}
          />
        ).toBlob();

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${keyword.replace(/\s+/g, "_")}_Formula_v${version.version_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "PDF downloaded", description: `Formula Brief v${version.version_number}` });
      } catch (pdfErr) {
        // Fallback: download as plain text file
        console.error("PDF generation failed, falling back to text:", pdfErr);
        const textBlob = new Blob([version.formula_brief_content], { type: "text/markdown" });
        const url = URL.createObjectURL(textBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${keyword.replace(/\s+/g, "_")}_Formula_v${version.version_number}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "Downloaded as Markdown", description: "PDF generation failed — saved as .md instead." });
      }
    } catch (e: any) {
      console.error("Download failed:", e);
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingVersion(null);
    }
  }, [keyword, toast]);

  const handleGenerateVersion = useCallback(async (feedbackId: string, changes: ParsedChange[], selected: Set<number>) => {
    setGeneratingVersion(feedbackId);
    try {
      const selectedPoints = changes
        .filter((_, i) => selected.has(i))
        .map(c => c.feedbackPoint);

      if (selectedPoints.length === 0) {
        toast({ title: "No changes selected", description: "Select at least one change to apply.", variant: "destructive" });
        setGeneratingVersion(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke("apply-selected-changes", {
        body: {
          feedbackId,
          categoryId,
          keyword,
          selectedPoints,
        },
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["manufacturer_feedback", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["formula_brief_versions"] });
      toast({ title: "New version generated", description: `Applied ${selectedPoints.length} change(s) to formula brief.` });
    } catch (e: any) {
      toast({ title: "Failed to generate version", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingVersion(null);
    }
  }, [categoryId, keyword, toast, queryClient]);

  const toggleChange = useCallback((feedbackId: string, index: number) => {
    setSelectedChanges(prev => {
      const next = { ...prev };
      const set = new Set(next[feedbackId] || []);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      next[feedbackId] = set;
      return next;
    });
  }, []);

  const handleCopyReply = useCallback(async (feedbackId: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedReply(feedbackId);
    setTimeout(() => setCopiedReply(null), 2000);
    toast({ title: "Copied to clipboard", description: "Reply ready to paste into your email." });
  }, [toast]);

  // Load existing feedback — poll every 4s while any row is processing
  const { data: feedbackList = [] } = useQuery({
    queryKey: ["manufacturer_feedback", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufacturer_feedback" as any)
        .select("*")
        .eq("category_id", categoryId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data as unknown) as FeedbackRow[];
    },
    enabled: !!categoryId,
    refetchInterval: (query) => {
      const rows = query.state.data as FeedbackRow[] | undefined;
      return rows?.some((r) => r.status === "processing" || r.status === "pending") ? 4000 : false;
    },
  });

  // Submit feedback mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!feedbackText.trim() && uploadedImages.length === 0) {
        throw new Error("Please add feedback text or upload an image");
      }
      const imageUrls = uploadedImages.map((i) => i.url);
      const { data, error } = await supabase.from("manufacturer_feedback" as any).insert({
        category_id: categoryId,
        keyword,
        feedback_text: feedbackText.trim() || null,
        image_urls: imageUrls,
        status: "pending",
      }).select().single();
      if (error) throw error;

      const feedbackId = (data as any)?.id;
      if (feedbackId) {
        supabase.functions.invoke("process-manufacturer-feedback", {
          body: { feedbackId },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      setFeedbackText("");
      setUploadedImages([]);
      queryClient.invalidateQueries({ queryKey: ["manufacturer_feedback", categoryId] });
      toast({ title: "Feedback submitted", description: "Scout is evaluating it now..." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded: { file: File; url: string }[] = [];
      for (const file of files) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        uploaded.push({ file, url: base64 });
      }
      setUploadedImages((prev) => [...prev, ...uploaded]);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const pendingCount = feedbackList.filter((f) => f.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Formula Version History Table */}
      <div className="rounded-[var(--radius)] border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-muted/40 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Formula Brief Versions</p>
              <p className="text-xs text-muted-foreground">
                {allVersions.length + (originalBrief ? 1 : 0)} version{allVersions.length + (originalBrief ? 1 : 0) !== 1 ? 's' : ''} · Active version is used for all analyses
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Version</th>
                <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</th>
                <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Change Summary</th>
                <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Generated</th>
                <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {allVersions.map(v => (
                <tr key={v.id} className={`hover:bg-muted/30 transition-colors ${v.is_active ? 'bg-primary/5' : ''}`}>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">v{v.version_number}</span>
                      {v.is_active && (
                        <Badge variant="default" className="text-[10px] h-5">Active</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <Badge variant="outline" className="text-[10px]">
                      {(v.change_summary || '').startsWith('[USER OVERRIDE]') ? '🏭 Manufacturer' : v.version_number === 1 ? '🧪 AI Generated' : '💬 Chat'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 max-w-[300px]">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {v.change_summary?.replace('[USER OVERRIDE] ', '') || 'Initial formula brief'}
                    </p>
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {format(new Date(v.created_at), "MMM d, yyyy · h:mm a")}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() => setViewingVersionId(v.id)}
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={downloadingVersion === v.id}
                        onClick={() => handleDownloadVersion(v.id)}
                      >
                        <Download className="w-3 h-3" />
                        {downloadingVersion === v.id ? "..." : "PDF"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Original formula brief from Compliance/AI analysis */}
              {originalBrief && (
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-4">
                    <span className="font-medium text-foreground">Original</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <Badge variant="outline" className="text-[10px]">⚖️ Compliance</Badge>
                  </td>
                  <td className="py-2.5 px-4 max-w-[300px]">
                    <p className="text-xs text-muted-foreground">Initial formula brief from market analysis pipeline</p>
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {originalBrief.created_at ? format(new Date(originalBrief.created_at), "MMM d, yyyy · h:mm a") : "—"}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() => setViewingVersionId("original")}
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {allVersions.length === 0 && !originalBrief && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No formula versions yet. Submit manufacturer feedback to generate versions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Version Viewing Dialog */}
      <Dialog open={viewingVersionId !== null} onOpenChange={(open) => !open && setViewingVersionId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {viewingVersionId === "original" ? "Original Formula Brief" : viewingVersion ? `Formula Brief v${viewingVersion.version_number}` : "Formula Brief"}
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm max-w-none dark:prose-invert
            prose-headings:font-semibold prose-headings:text-foreground
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-strong:text-foreground
            prose-table:text-xs
            prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:font-semibold prose-th:border-b prose-th:border-border
            prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-border/50 prose-td:text-muted-foreground
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {viewingVersionId === "original"
                ? (originalBrief?.content || "No content available")
                : (viewingVersion?.formula_brief_content || "No content available")}
            </ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>

    <div className="border border-border rounded-[var(--radius)] bg-card mt-0">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <Factory className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-sm text-gray-800">Manufacturer Feedback</span>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
              {pendingCount} pending
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Submit form */}
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Submit feedback from your manufacturer. Scout will evaluate each point and update the formula brief or push back with evidence.
            </p>
            <Textarea
              placeholder="Paste manufacturer feedback here — e.g. 'CMO suggests switching zinc gluconate to zinc oxide for cost, reducing biotin to 2500mcg, adding silicon dioxide as flow agent...'"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={4}
              className="text-sm resize-none"
            />

            {/* Image uploads */}
            <div className="flex flex-wrap gap-2">
              {uploadedImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.url} alt="" className="w-16 h-16 object-cover rounded border border-gray-200" />
                  <button
                    onClick={() => setUploadedImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <label className="w-16 h-16 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Image className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-400 mt-0.5">Add</span>
                  </>
                )}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || (!feedbackText.trim() && uploadedImages.length === 0)}
              size="sm"
              className="w-full gap-2"
            >
              {submitMutation.isPending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Sending to Scout...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Submit Feedback
                </>
              )}
            </Button>
          </div>

          {/* Feedback history — NO scroll area, full display */}
          {feedbackList.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">History</p>
              <div className="space-y-2">
                {feedbackList.map((fb) => {
                  const verdict = fb.claude_verdict ? VERDICT_CONFIG[fb.claude_verdict] : null;
                  const isOpen = expandedFeedback === fb.id;
                  const parsedChanges = parseChangesFromResponse(fb.claude_response);
                  const selected = selectedChanges[fb.id] || new Set<number>();
                  const isGenerating = generatingVersion === fb.id;

                  return (
                    <div key={fb.id} className={`border rounded-[var(--radius)] overflow-hidden ${verdict?.bg || "bg-muted/30 border-border"}`}>
                      <button
                        onClick={() => setExpandedFeedback(isOpen ? null : fb.id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {verdict ? (
                            <verdict.icon className={`w-3.5 h-3.5 flex-shrink-0 ${verdict.color}`} />
                          ) : fb.status === "processing" || fb.status === "pending" ? (
                            <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full bg-orange-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="text-xs text-foreground line-clamp-1">
                              {fb.feedback_text || `${fb.image_urls?.length || 0} image(s)`}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(fb.submitted_at), "MMM d, yyyy · h:mm a")}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          {verdict && (
                            <span className={`text-xs font-medium ${verdict.color}`}>{verdict.label}</span>
                          )}
                          {(fb.status === "pending" || fb.status === "processing") && (
                            <Badge variant="outline" className="text-xs text-primary border-primary/30 gap-1.5 animate-fade-in">
                              <div className="w-2.5 h-2.5 border-[1.5px] border-primary/30 border-t-primary rounded-full animate-spin" />
                              {fb.status === "pending" ? "Queued" : "Analyzing..."}
                            </Badge>
                          )}
                          {isOpen ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-3 pb-3 space-y-3 border-t border-gray-200">
                          {fb.feedback_text && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1 mt-2">Feedback</p>
                              <p className="text-xs text-gray-700 whitespace-pre-wrap">{fb.feedback_text}</p>
                            </div>
                          )}
                          {fb.image_urls?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {fb.image_urls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} alt="" className="w-12 h-12 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
                                </a>
                              ))}
                            </div>
                          )}
                          {fb.claude_response && (() => {
                            // Parse structured sections from the response
                            const overallMatch = fb.claude_response.match(/##\s*OVERALL VERDICT\s*\n+\[?(ACCEPTED|PARTIALLY ACCEPTED|QUESTIONED|REJECTED)\]?\s*\n*([\s\S]*?)(?=\n##\s*FEEDBACK|$)/i);
                            const overallVerdict = overallMatch?.[1] || "";
                            const overallSummary = overallMatch?.[2]?.trim() || "";

                            return (
                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                                  Scout's Evaluation
                                </p>

                                {/* Overall verdict card */}
                                {overallVerdict && (
                                  <div className="rounded-[var(--radius)] border border-border bg-card p-4 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Overall Verdict</span>
                                      <Badge
                                        variant="outline"
                                        className={`text-xs px-2 py-0.5 ${
                                          overallVerdict.includes("ACCEPTED") && !overallVerdict.includes("PARTIALLY")
                                            ? "text-green-700 border-green-300 bg-green-50"
                                            : overallVerdict.includes("PARTIALLY")
                                            ? "text-amber-700 border-amber-300 bg-amber-50"
                                            : overallVerdict.includes("QUESTIONED")
                                            ? "text-blue-700 border-blue-300 bg-blue-50"
                                            : "text-red-700 border-red-300 bg-red-50"
                                        }`}
                                      >
                                        {overallVerdict}
                                      </Badge>
                                    </div>
                                    {overallSummary && (
                                      <p className="text-xs leading-relaxed text-muted-foreground">{overallSummary}</p>
                                    )}
                                  </div>
                                )}

                                {/* Feedback evaluation table — rendered in a card */}
                                {parsedChanges.length > 0 && (
                                  <div className="rounded-[var(--radius)] border border-border bg-card overflow-hidden">
                                    <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                                      <span className="text-xs font-semibold text-foreground">Point-by-Point Evaluation</span>
                                    </div>
                                    <div className="divide-y divide-border">
                                      {parsedChanges.map((change, i) => {
                                        const isAccepted = change.verdict.toUpperCase().includes("ACCEPTED");
                                        const isRejected = change.verdict.toUpperCase().includes("REJECTED");
                                        return (
                                          <div key={i} className="px-4 py-3 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-xs font-semibold text-foreground">{change.feedbackPoint}</span>
                                              <Badge
                                                variant="outline"
                                                className={`text-[10px] px-1.5 py-0 h-4 ${
                                                  isAccepted
                                                    ? "text-green-700 border-green-300 bg-green-50"
                                                    : isRejected
                                                    ? "text-red-700 border-red-300 bg-red-50"
                                                    : "text-amber-700 border-amber-300 bg-amber-50"
                                                }`}
                                              >
                                                {change.verdict}
                                              </Badge>
                                            </div>
                                            <p className="text-xs leading-relaxed text-muted-foreground">{change.reasoning}</p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Fallback: if we couldn't parse structured content, show raw markdown */}
                                {parsedChanges.length === 0 && !overallVerdict && (
                                  <div className="rounded-[var(--radius)] border border-border bg-card p-4 overflow-x-auto">
                                    <div className="prose prose-sm max-w-none dark:prose-invert
                                      prose-headings:font-semibold prose-headings:text-foreground prose-headings:text-sm prose-headings:mt-4 prose-headings:mb-2
                                      prose-p:text-xs prose-p:leading-relaxed prose-p:my-2 prose-p:text-muted-foreground
                                      prose-strong:text-foreground
                                      prose-table:text-xs
                                      prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:font-semibold prose-th:border-b prose-th:border-border
                                      prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-border/50 prose-td:text-muted-foreground prose-td:align-top
                                    ">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {fb.claude_response}
                                      </ReactMarkdown>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Selectable changes — user overrides AI verdict */}
                          {fb.status === "reviewed" && parsedChanges.length > 0 && !fb.resulting_version_id && (
                            <div className="border border-primary/20 rounded-lg p-4 bg-primary/5 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-foreground">
                                  Select changes to apply to the formula brief
                                </p>
                                <span className="text-xs text-muted-foreground">
                                  {selected.size} of {parsedChanges.length} selected
                                </span>
                              </div>
                              <div className="space-y-2">
                                {parsedChanges.map((change, i) => {
                                  const isAccepted = change.verdict.toUpperCase().includes("ACCEPTED");
                                  const isRejected = change.verdict.toUpperCase().includes("REJECTED");
                                  const isChecked = selected.has(i);
                                  return (
                                    <label
                                      key={i}
                                      className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-colors ${
                                        isChecked
                                          ? "bg-white border-primary/30 shadow-sm"
                                          : "bg-white/50 border-border/50 hover:border-border"
                                      }`}
                                    >
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={() => toggleChange(fb.id, i)}
                                        className="mt-0.5 flex-shrink-0"
                                      />
                                      <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-medium text-foreground">
                                            {change.feedbackPoint}
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className={`text-[10px] px-1.5 py-0 h-4 flex-shrink-0 ${
                                              isAccepted
                                                ? "text-green-700 border-green-300 bg-green-50"
                                                : isRejected
                                                ? "text-red-700 border-red-300 bg-red-50"
                                                : "text-amber-700 border-amber-300 bg-amber-50"
                                            }`}
                                          >
                                            {change.verdict}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                          {change.reasoning}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                              <Button
                                size="sm"
                                className="w-full mt-1 gap-2"
                                disabled={selected.size === 0 || isGenerating}
                                onClick={() => handleGenerateVersion(fb.id, parsedChanges, selected)}
                              >
                                {isGenerating ? (
                                  <>
                                    <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                    Generating new version...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {`Apply ${selected.size} change(s) & generate new version`}
                                  </>
                                )}
                              </Button>
                            </div>
                          )}

                          {/* Editable reply to manufacturer */}
                          {fb.status === "reviewed" && fb.claude_response && (() => {
                            const defaultReply = parseManufacturerReply(fb.claude_response);
                            const replyText = replyEdits[fb.id] ?? defaultReply;
                            if (!defaultReply && !replyText) return null;
                            const isCopied = copiedReply === fb.id;
                            return (
                          <div className="rounded-[var(--radius)] border border-border bg-card shadow-sm overflow-hidden">
                                <div className="flex items-center justify-between px-5 py-3.5 bg-muted/40 border-b border-border">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                      <MessageSquare className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">Reply to Manufacturer</p>
                                      <p className="text-xs text-muted-foreground">Edit before sending — pre-filled with Scout's recommendations</p>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant={isCopied ? "default" : "outline"}
                                    className="h-9 text-sm gap-2 px-4"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyReply(fb.id, replyText);
                                    }}
                                  >
                                    {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {isCopied ? "Copied!" : "Copy Reply"}
                                  </Button>
                                </div>
                                <div className="p-4">
                                  <Textarea
                                    value={replyText}
                                    onChange={(e) => setReplyEdits(prev => ({ ...prev, [fb.id]: e.target.value }))}
                                    rows={12}
                                    className="text-sm leading-relaxed resize-y bg-background border-border focus-visible:ring-primary/30 min-h-[200px]"
                                  />
                                </div>
                              </div>
                            );
                          })()}

                          {fb.resulting_version_id && (
                            <div className="rounded-[var(--radius)] border border-green-200 bg-green-50/50 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                  <p className="text-sm font-medium text-green-800">
                                    New formula version created
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5"
                                  disabled={downloadingVersion === fb.resulting_version_id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadVersion(fb.resulting_version_id!);
                                  }}
                                >
                                  <Download className="w-3 h-3" />
                                  {downloadingVersion === fb.resulting_version_id ? "Generating..." : "Download PDF"}
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                View the latest version in the <strong>Strategy Brief</strong> tab — it's automatically set as the active version.
                              </p>
                            </div>
                          )}
                          {fb.reviewed_at && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              Reviewed {format(new Date(fb.reviewed_at), "MMM d, yyyy · h:mm a")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
