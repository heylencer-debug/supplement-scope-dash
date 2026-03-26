import { useState } from "react";
import { Factory, Upload, Send, CheckCircle, XCircle, HelpCircle, AlertCircle, ChevronDown, ChevronUp, X, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  resulting_version_id: string | null;
}

const VERDICT_CONFIG = {
  accepted: { label: "Accepted", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  partially_accepted: { label: "Partially Accepted", icon: AlertCircle, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
  questioned: { label: "Questioned", icon: HelpCircle, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

export function ManufacturerFeedback({ categoryId, keyword, defaultExpanded = false }: ManufacturerFeedbackProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [feedbackText, setFeedbackText] = useState("");
  const [uploadedImages, setUploadedImages] = useState<{ file: File; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);

  // Load existing feedback — poll every 4s while any row is processing
  const { data: feedbackList = [] } = useQuery({
    queryKey: ["manufacturer_feedback", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufacturer_feedback")
        .select("*")
        .eq("category_id", categoryId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data as FeedbackRow[];
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
      const { data, error } = await supabase.from("manufacturer_feedback").insert({
        category_id: categoryId,
        keyword,
        feedback_text: feedbackText.trim() || null,
        image_urls: imageUrls,
        status: "pending",
      }).select().single();
      if (error) throw error;

      // Trigger Edge Function to process immediately (fire and forget)
      supabase.functions.invoke("process-manufacturer-feedback", {
        body: { feedbackId: data.id },
      }).catch(() => {/* silent — status will show in history */});
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

  // Image upload handler — converts to base64 and stores inline (no storage bucket needed)
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

          {/* Feedback history */}
          {feedbackList.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">History</p>
              <ScrollArea className="max-h-96">
                <div className="space-y-2">
                  {feedbackList.map((fb) => {
                    const verdict = fb.claude_verdict ? VERDICT_CONFIG[fb.claude_verdict] : null;
                    const isOpen = expandedFeedback === fb.id;
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
                            <span className="text-xs text-gray-700 truncate">
                              {fb.feedback_text?.substring(0, 80) || `${fb.image_urls?.length || 0} image(s)`}
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
                          <div className="px-3 pb-3 space-y-2 border-t border-gray-200">
                            {fb.feedback_text && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 mb-1">Feedback</p>
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
                                <p className="text-xs font-medium text-gray-500 mb-1">Scout's Response</p>
                                <div className="text-xs prose prose-xs max-w-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {fb.claude_response}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}
                            {fb.resulting_version_id && (
                              <p className="text-xs text-green-700">
                                ✓ New formula version created from this feedback
                              </p>
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
              </ScrollArea>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
