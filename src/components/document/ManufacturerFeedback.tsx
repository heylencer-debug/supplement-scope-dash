import { useState, useCallback, useMemo } from "react";
import { Factory, Upload, Send, CheckCircle, XCircle, HelpCircle, AlertCircle, ChevronDown, ChevronUp, X, Image, Download, Sparkles } from "lucide-react";
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

  const handleDownloadVersion = useCallback(async (versionId: string) => {
    setDownloadingVersion(versionId);
    try {
      const { data: version, error } = await supabase
        .from("formula_brief_versions")
        .select("formula_brief_content, version_number, created_at")
        .eq("id", versionId)
        .single();
      if (error || !version) throw new Error("Version not found");

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
    } catch (e: any) {
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
    <div className="border border-gray-200 rounded-lg bg-white mt-4">
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
              className="w-full"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {submitMutation.isPending ? "Submitting..." : "Submit Feedback"}
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
                    <div key={fb.id} className={`border rounded-lg overflow-hidden ${verdict?.bg || "bg-gray-50 border-gray-200"}`}>
                      <button
                        onClick={() => setExpandedFeedback(isOpen ? null : fb.id)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {verdict ? (
                            <verdict.icon className={`w-3.5 h-3.5 flex-shrink-0 ${verdict.color}`} />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full bg-orange-400 flex-shrink-0" />
                          )}
                          <span className="text-xs text-gray-700">
                            {fb.feedback_text || `${fb.image_urls?.length || 0} image(s)`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          {verdict && (
                            <span className={`text-xs font-medium ${verdict.color}`}>{verdict.label}</span>
                          )}
                          {fb.status === "pending" && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Pending</Badge>
                          )}
                          {fb.status === "processing" && (
                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Processing</Badge>
                          )}
                          {isOpen ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
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
                          {fb.claude_response && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Scout's Response</p>
                              <div className="text-xs prose prose-sm max-w-none dark:prose-invert prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-th:bg-muted prose-th:text-left prose-th:font-medium prose-td:px-2 prose-td:py-1 prose-td:border-t prose-td:border-border prose-tr:border-border overflow-x-auto">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {fb.claude_response}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}

                          {/* Selectable changes — user overrides AI verdict */}
                          {fb.status === "reviewed" && parsedChanges.length > 0 && !fb.resulting_version_id && (
                            <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 space-y-2">
                              <p className="text-xs font-semibold text-foreground">
                                Select changes to apply to the formula brief:
                              </p>
                              <div className="space-y-1.5">
                                {parsedChanges.map((change, i) => {
                                  const isAccepted = change.verdict.toUpperCase().includes("ACCEPTED");
                                  const isRejected = change.verdict.toUpperCase().includes("REJECTED");
                                  return (
                                    <label
                                      key={i}
                                      className="flex items-start gap-2 cursor-pointer hover:bg-white/50 rounded p-1.5 transition-colors"
                                    >
                                      <Checkbox
                                        checked={selected.has(i)}
                                        onCheckedChange={() => toggleChange(fb.id, i)}
                                        className="mt-0.5"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-medium text-foreground">
                                            {change.feedbackPoint}
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className={`text-[10px] px-1 py-0 h-4 ${
                                              isAccepted
                                                ? "text-green-700 border-green-300 bg-green-50"
                                                : isRejected
                                                ? "text-red-700 border-red-300 bg-red-50"
                                                : "text-blue-700 border-blue-300 bg-blue-50"
                                            }`}
                                          >
                                            {change.verdict}
                                          </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                          {change.reasoning}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                              <Button
                                size="sm"
                                className="w-full mt-2 gap-1.5"
                                disabled={selected.size === 0 || isGenerating}
                                onClick={() => handleGenerateVersion(fb.id, parsedChanges, selected)}
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                {isGenerating
                                  ? "Generating new version..."
                                  : `Apply ${selected.size} change(s) & generate new version`}
                              </Button>
                            </div>
                          )}

                          {fb.resulting_version_id && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-green-700 flex-1">
                                ✓ New formula version created
                              </p>
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
                          )}
                          <p className="text-xs text-gray-400">
                            Submitted {new Date(fb.submitted_at).toLocaleDateString()}
                            {fb.reviewed_at && ` · Reviewed ${new Date(fb.reviewed_at).toLocaleDateString()}`}
                          </p>
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
  );
}
