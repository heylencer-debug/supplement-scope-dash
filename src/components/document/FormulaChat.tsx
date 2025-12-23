import { useState, useRef, useEffect } from "react";
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  Sparkles, 
  X, 
  Trash2, 
  Wand2, 
  Eye, 
  EyeOff, 
  MessageSquare, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check,
  RotateCcw,
  Pencil,
  History,
  Database,
  FlaskConical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useFormulaConversation, Message } from "@/hooks/useFormulaConversation";
import { useFormulaBriefVersions } from "@/hooks/useFormulaBriefVersions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface FormulaChatProps {
  categoryId: string;
  currentFormula: string;
  onClose: () => void;
  onVersionCreated?: () => void;
}

interface GeneratedFormula {
  change_summary: string;
  new_formula_content: string;
}

interface GenerationProgress {
  taskId: string;
  elapsedSeconds: number;
}

// Code block with copy button
function CodeBlockWithCopy({ content, children }: { content: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <div className="relative group my-3">
      <pre className="p-3 pr-10 rounded-lg bg-muted/80 border border-border overflow-x-auto text-xs leading-relaxed">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
        title="Copy code"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

// Copy button for entire message
function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md bg-background/90 border border-border hover:bg-muted text-xs flex items-center gap-1"
      title="Copy message"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-green-500" />
          <span className="text-green-500">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Copy</span>
        </>
      )}
    </button>
  );
}

// Component for expandable messages
function ExpandableMessage({ content, isUser }: { content: string; isUser: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Only truncate very long messages - markdown renders compactly
  const shouldTruncate = !isUser && content.length > 2000;
  const displayContent = shouldTruncate && !isExpanded 
    ? content.slice(0, 2000) + '...' 
    : content;

  if (isUser) {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  const markdownComponents = {
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-4 rounded-lg border border-border">
        <table className="w-full text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-primary/10">{children}</thead>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border text-xs">
        {children}
      </th>
    ),
    tbody: ({ children }: { children?: React.ReactNode }) => (
      <tbody className="divide-y divide-border">{children}</tbody>
    ),
    tr: ({ children }: { children?: React.ReactNode }) => (
      <tr className="even:bg-muted/30">{children}</tr>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="px-3 py-2 text-muted-foreground text-xs">{children}</td>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-sm text-muted-foreground leading-relaxed mb-3 last:mb-0">
        {children}
      </p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc list-outside ml-5 space-y-1.5 text-sm text-muted-foreground mb-3">
        {children}
      </ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal list-outside ml-5 space-y-1.5 text-sm text-muted-foreground mb-3">
        {children}
      </ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="font-bold text-base text-foreground mt-4 mb-2">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="font-semibold text-sm text-foreground mt-4 mb-2">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="font-semibold text-sm text-foreground mt-3 mb-2">{children}</h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className="font-medium text-sm text-foreground mt-3 mb-1.5">{children}</h4>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    hr: () => <hr className="my-4 border-border" />,
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-xs">
            {children}
          </code>
        );
      }
      const language = className?.replace('language-', '') || '';
      return (
        <code className={`block text-xs font-mono ${language ? `language-${language}` : ''}`}>
          {children}
        </code>
      );
    },
    pre: ({ children }: { children?: React.ReactNode }) => {
      // Extract text content from children for copying
      const extractText = (node: React.ReactNode): string => {
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(extractText).join('');
        if (node && typeof node === 'object' && 'props' in node) {
          return extractText((node as React.ReactElement).props.children);
        }
        return '';
      };
      const textContent = extractText(children);
      
      return <CodeBlockWithCopy content={textContent}>{children}</CodeBlockWithCopy>;
    },
  };

  return (
    <div className="space-y-2">
      <div className="max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {displayContent}
        </ReactMarkdown>
      </div>
      {shouldTruncate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3 mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3 mr-1" />
              Show more
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export function FormulaChat({ 
  categoryId, 
  currentFormula, 
  onClose,
  onVersionCreated 
}: FormulaChatProps) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [generatedFormula, setGeneratedFormula] = useState<GeneratedFormula | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showVersionSwitchDialog, setShowVersionSwitchDialog] = useState(false);
  const [pendingVersionId, setPendingVersionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showCompetitorData, setShowCompetitorData] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { createVersion, activeVersion, versions, setActiveVersion, isCreatingVersion, isSettingActive } = useFormulaBriefVersions(categoryId);
  const { conversation, addMessage, updateMessages, clearConversation, isLoading } = useFormulaConversation(categoryId, activeVersion?.id);

  // Fetch competitor ingredient analysis data
  const { data: competitorData } = useQuery({
    queryKey: ["ingredient_analyses_full", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredient_analyses")
        .select("analysis, type")
        .eq("category_id", categoryId);
      
      if (error) throw error;
      
      // Parse and extract useful data
      let totalProducts = 0;
      let hasData = false;
      const ingredientsList: Array<{
        name: string;
        prevalence?: string;
        dosage?: string;
        trend?: string;
        source: 'new_winners' | 'top_performers';
      }> = [];
      const competitorDetails: Array<{
        brand: string;
        ingredients: string[];
        source: 'new_winners' | 'top_performers';
      }> = [];
      
      if (data && data.length > 0) {
        hasData = true;
        for (const item of data) {
          const analysis = item.analysis as Record<string, unknown>;
          const source = item.type as 'new_winners' | 'top_performers';
          
          // Extract ingredients
          if (analysis?.ingredients && Array.isArray(analysis.ingredients)) {
            for (const ing of analysis.ingredients.slice(0, 10)) {
              const ingredient = ing as Record<string, unknown>;
              ingredientsList.push({
                name: String(ingredient.name || ingredient.ingredient || 'Unknown'),
                prevalence: ingredient.prevalence ? String(ingredient.prevalence) : undefined,
                dosage: ingredient.avg_dosage || ingredient.dosage ? String(ingredient.avg_dosage || ingredient.dosage) : undefined,
                trend: ingredient.trend ? String(ingredient.trend) : undefined,
                source
              });
            }
          }
          
          // Extract competitor details
          if (analysis?.competitor_details && Array.isArray(analysis.competitor_details)) {
            totalProducts += analysis.competitor_details.length;
            for (const comp of analysis.competitor_details.slice(0, 5)) {
              const competitor = comp as Record<string, unknown>;
              const keyIngredients = competitor.key_ingredients || competitor.ingredients;
              competitorDetails.push({
                brand: String(competitor.brand || competitor.name || 'Unknown'),
                ingredients: Array.isArray(keyIngredients) 
                  ? keyIngredients.map(i => String(i)) 
                  : keyIngredients ? [String(keyIngredients)] : [],
                source
              });
            }
          }
        }
      }
      
      return { 
        hasData, 
        productCount: totalProducts, 
        analysisCount: data?.length || 0,
        ingredients: ingredientsList,
        competitors: competitorDetails
      };
    },
    enabled: !!categoryId
  });

  const messages = conversation?.messages || [];

  // Restore last selected version from localStorage on mount
  useEffect(() => {
    const savedVersionId = localStorage.getItem(`formula-version-${categoryId}`);
    if (savedVersionId && versions.length > 0) {
      const versionExists = versions.some(v => v.id === savedVersionId);
      if (versionExists && savedVersionId !== activeVersion?.id) {
        setActiveVersion(savedVersionId);
      }
    }
  }, [categoryId, versions.length]);

  // Save selected version to localStorage when it changes
  useEffect(() => {
    if (activeVersion?.id) {
      localStorage.setItem(`formula-version-${categoryId}`, activeVersion.id);
    }
  }, [activeVersion?.id, categoryId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isStreaming || isGenerating) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setInput("");
    setStreamingContent("");

    // Add user message to conversation
    await addMessage({ categoryId, message: userMessage, versionId: activeVersion?.id });

    setIsStreaming(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/modify-formula`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          },
          body: JSON.stringify({
            categoryId,
            userMessage: userMessage.content,
            conversationHistory: messages,
            currentFormula,
            generateFormula: false // Conversation mode
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = ""; // Buffer for incomplete SSE lines
      let streamFinished = false;

      console.log('[FormulaChat] Starting stream...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[FormulaChat] Stream reader done');
          break;
        }

        // Append new data to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Only process complete lines (ending with \n)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // Keep incomplete last line in buffer
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith(':')) continue; // Skip empty lines and comments
          
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6).trim();
            if (data === '[DONE]') {
              streamFinished = true;
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                setStreamingContent(fullContent);
              }
              // Check for finish reason
              const finishReason = parsed.choices?.[0]?.finish_reason;
              if (finishReason) {
                streamFinished = true;
                console.log('[FormulaChat] Stream finished with reason:', finishReason);
              }
            } catch (e) {
              console.warn('[FormulaChat] Failed to parse SSE chunk:', data.substring(0, 100));
            }
          }
        }
      }

      // Process any remaining buffer after stream ends
      if (buffer.trim()) {
        const trimmedBuffer = buffer.trim();
        if (trimmedBuffer.startsWith('data: ')) {
          const data = trimmedBuffer.slice(6).trim();
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
              }
            } catch {
              // Ignore incomplete final chunk
            }
          }
        }
      }

      console.log('[FormulaChat] Final content length:', fullContent.length);
      if (!streamFinished) {
        console.warn('[FormulaChat] Stream ended without finish_reason - may have been truncated');
      }

      // Save assistant message
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString()
      };

      await addMessage({ categoryId, message: assistantMessage, versionId: activeVersion?.id });
      setStreamingContent("");

    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: "Failed to get AI response. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsStreaming(false);
    }
  };

  // Poll for generation status
  const pollForStatus = async (taskId: string) => {
    console.log('[FormulaChat] Polling for task status:', taskId);
    
    try {
      const response = await supabase.functions.invoke('check-generation-status', {
        body: { taskId }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to check status');
      }

      const data = response.data;
      console.log('[FormulaChat] Poll response:', data.status, data.elapsedSeconds + 's');

      // Update progress indicator
      setGenerationProgress({ taskId, elapsedSeconds: data.elapsedSeconds || 0 });

      if (data.status === 'completed') {
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setGenerationProgress(null);

        let content = data.content;

        // Strip markdown code blocks if present (```json ... ```)
        if (content && content.startsWith('```')) {
          content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }

        // Parse the JSON response
        try {
          const parsed = JSON.parse(content);
          if (parsed.change_summary && parsed.new_formula_content) {
            setGeneratedFormula(parsed);
            setShowConfirmDialog(true);
          } else {
            throw new Error('Invalid response format');
          }
        } catch {
          console.error('Failed to parse generation response:', content);
          toast({
            title: "Error",
            description: "Failed to parse the generated formula. Please try again.",
            variant: "destructive"
          });
        }
        
        setIsGenerating(false);
        return;
      }

      if (data.status === 'failed') {
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setGenerationProgress(null);
        
        toast({
          title: "Generation Failed",
          description: data.error || "Failed to generate formula. Please try again.",
          variant: "destructive"
        });
        
        setIsGenerating(false);
        return;
      }

      // Still processing - continue polling
    } catch (error) {
      console.error('[FormulaChat] Polling error:', error);
      // Don't stop polling on network errors - just log and continue
    }
  };

  const handleGenerateFormula = async () => {
    if (isStreaming || isGenerating || messages.length === 0) return;

    setIsGenerating(true);
    setGenerationProgress(null);

    try {
      // Start the generation task
      const response = await supabase.functions.invoke('modify-formula', {
        body: {
          categoryId,
          userMessage: "Please generate the updated formula now with all the changes we discussed.",
          conversationHistory: messages,
          currentFormula,
          generateFormula: true
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to start generation');
      }

      const data = response.data;
      
      if (!data.taskId) {
        throw new Error('No task ID returned');
      }

      console.log('[FormulaChat] Generation task started:', data.taskId);
      setGenerationProgress({ taskId: data.taskId, elapsedSeconds: 0 });

      // Start polling every 2 seconds
      pollingIntervalRef.current = setInterval(() => {
        pollForStatus(data.taskId);
      }, 2000);

      // Also poll immediately
      pollForStatus(data.taskId);

    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Error",
        description: "Failed to start formula generation. Please try again.",
        variant: "destructive"
      });
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const handleConfirmSave = async () => {
    if (!generatedFormula) return;

    try {
      await createVersion({
        categoryId,
        formulaBriefContent: generatedFormula.new_formula_content,
        changeSummary: generatedFormula.change_summary,
        parentVersionId: activeVersion?.id
      });

      toast({
        title: "Version created",
        description: `New formula version saved: ${generatedFormula.change_summary}`
      });

      setGeneratedFormula(null);
      setShowConfirmDialog(false);
      onVersionCreated?.();
    } catch (error) {
      console.error('Error creating version:', error);
      toast({
        title: "Error",
        description: "Failed to save new version. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleClearConversation = async () => {
    if (!conversation?.id) return;
    
    try {
      await clearConversation(conversation.id);
      toast({
        title: "Conversation cleared",
        description: "Chat history has been cleared."
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to clear conversation.",
        variant: "destructive"
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRegenerate = async () => {
    if (!conversation?.id || isStreaming || isGenerating || messages.length < 2) return;
    
    // Find the last user message
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;
    
    const lastUserMessage = messages[lastUserIndex];
    
    // Remove the last assistant message (keep messages up to and including the last user message)
    const messagesWithoutLastAssistant = messages.slice(0, lastUserIndex + 1);
    
    // Update the conversation in DB
    await updateMessages({ 
      conversationId: conversation.id, 
      messages: messagesWithoutLastAssistant 
    });
    
    setStreamingContent("");
    setIsStreaming(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/modify-formula`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          },
          body: JSON.stringify({
            categoryId,
            userMessage: lastUserMessage.content,
            conversationHistory: messagesWithoutLastAssistant.slice(0, -1), // Exclude the last user message
            currentFormula,
            generateFormula: false
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith(':')) continue;

          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                setStreamingContent(fullContent);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Save assistant message
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString()
      };

      await addMessage({ categoryId, message: assistantMessage });
      setStreamingContent("");

      toast({
        title: "Response regenerated",
        description: "AI has provided a new response."
      });

    } catch (error) {
      console.error('Regenerate error:', error);
      toast({
        title: "Error",
        description: "Failed to regenerate response. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStartEdit = (message: Message) => {
    setEditingMessageId(message.id);
    setEditContent(message.content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleSaveEdit = async (messageIndex: number) => {
    if (!conversation?.id || !editContent.trim() || isStreaming || isGenerating) return;
    
    // Keep messages up to and including the edited message, but update its content
    const editedMessages = messages.slice(0, messageIndex + 1).map((m, i) => 
      i === messageIndex ? { ...m, content: editContent.trim() } : m
    );
    
    // Update the conversation in DB (removes all messages after the edited one)
    await updateMessages({ 
      conversationId: conversation.id, 
      messages: editedMessages 
    });
    
    setEditingMessageId(null);
    setEditContent("");
    setStreamingContent("");
    setIsStreaming(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/modify-formula`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          },
          body: JSON.stringify({
            categoryId,
            userMessage: editContent.trim(),
            conversationHistory: editedMessages.slice(0, -1), // Exclude the edited user message
            currentFormula,
            generateFormula: false
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith(':')) continue;

          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                setStreamingContent(fullContent);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Save assistant message
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString()
      };

      await addMessage({ categoryId, message: assistantMessage });
      setStreamingContent("");

      toast({
        title: "Message updated",
        description: "AI has provided a new response."
      });

    } catch (error) {
      console.error('Edit error:', error);
      toast({
        title: "Error",
        description: "Failed to get AI response. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full bg-background border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Formula AI</h3>
              <p className="text-xs text-muted-foreground">Modify your formula</p>
            </div>
            {versions.length > 0 ? (
              <Select
                value={activeVersion?.id || "original"}
                onValueChange={(value) => {
                  if (value !== "original" && value !== activeVersion?.id) {
                    if (input.trim()) {
                      // Has unsent content, show confirmation
                      setPendingVersionId(value);
                      setShowVersionSwitchDialog(true);
                    } else {
                      setActiveVersion(value);
                    }
                  }
                }}
                disabled={isSettingActive}
              >
                <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs border-primary/30 bg-transparent hover:bg-muted/50 disabled:opacity-50">
                  {isSettingActive ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <History className="w-3 h-3" />
                  )}
                  <SelectValue>
                    {isSettingActive ? "Switching..." : activeVersion ? `v${activeVersion.version_number}` : "Original"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {versions.map((version) => (
                    <SelectItem 
                      key={version.id} 
                      value={version.id}
                      className="text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">v{version.version_number}</span>
                        {version.change_summary && (
                          <span className="text-muted-foreground truncate max-w-[150px]">
                            – {version.change_summary}
                          </span>
                        )}
                        {version.is_active && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            Active
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="text-xs ml-2 border-muted-foreground/30 text-muted-foreground">
                Original
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {competitorData?.hasData && (
              <Badge 
                variant="outline" 
                className="text-xs gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                title="Competitor ingredient data available - AI has access to competitor formulations"
              >
                <Database className="w-3 h-3" />
                {competitorData.productCount > 0 
                  ? `${competitorData.productCount} competitors` 
                  : `${competitorData.analysisCount} analysis${competitorData.analysisCount > 1 ? 'es' : ''}`}
              </Badge>
            )}
            {messages.length > 0 && (
              <Badge variant="secondary" className="text-xs gap-1">
                <MessageSquare className="w-3 h-3" />
                {messages.length}
              </Badge>
            )}
            {messages.length > 0 && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={handleClearConversation}
                title="Clear conversation"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Version Change Summary Banner */}
        {activeVersion?.change_summary && (
          <div className="px-4 py-2 bg-primary/5 border-b border-primary/10">
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-primary mb-0.5">Version {activeVersion.version_number} Changes</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{activeVersion.change_summary}</p>
              </div>
            </div>
          </div>
        )}

        {/* Competitor Ingredients Collapsible */}
        {competitorData?.hasData && (
          <Collapsible open={showCompetitorData} onOpenChange={setShowCompetitorData}>
            <CollapsibleTrigger asChild>
              <button className="w-full px-4 py-2 flex items-center justify-between bg-emerald-500/5 border-b border-emerald-500/20 hover:bg-emerald-500/10 transition-colors">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    Competitor Ingredients
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    {competitorData.ingredients?.length || 0} ingredients
                  </Badge>
                </div>
                <ChevronDown className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 transition-transform ${showCompetitorData ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20 max-h-[200px] overflow-y-auto">
                {/* Top Ingredients */}
                {competitorData.ingredients && competitorData.ingredients.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">
                      Key Ingredients Found
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {competitorData.ingredients.slice(0, 12).map((ing, idx) => (
                        <Badge 
                          key={idx} 
                          variant="secondary" 
                          className="text-[10px] px-1.5 py-0.5 bg-background/80"
                          title={`${ing.prevalence ? `${ing.prevalence}% of products` : ''}${ing.dosage ? ` • ${ing.dosage}` : ''}${ing.trend ? ` • Trend: ${ing.trend}` : ''}`}
                        >
                          {ing.name}
                          {ing.prevalence && (
                            <span className="ml-1 text-muted-foreground">({ing.prevalence}%)</span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Competitor Formulations */}
                {competitorData.competitors && competitorData.competitors.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">
                      Competitor Formulations
                    </p>
                    <div className="space-y-1.5">
                      {competitorData.competitors.slice(0, 4).map((comp, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-medium text-foreground">{comp.brand}:</span>
                          <span className="text-muted-foreground ml-1">
                            {comp.ingredients.slice(0, 4).join(', ')}
                            {comp.ingredients.length > 4 && ` +${comp.ingredients.length - 4} more`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {(!competitorData.ingredients || competitorData.ingredients.length === 0) && 
                 (!competitorData.competitors || competitorData.competitors.length === 0) && (
                  <p className="text-xs text-muted-foreground">
                    Competitor data available. Ask the AI about competitor ingredients.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 && !isStreaming && (
              <div className="text-center py-8">
                <Bot className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <h4 className="font-medium text-foreground mb-1">Formula AI Assistant</h4>
                <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
                  {activeVersion 
                    ? `Continue refining Version ${activeVersion.version_number}. Discuss changes and generate new versions.`
                    : "Discuss modifications to your formula. When ready, click \"Modify Formula Now\" to generate the updated version."
                  }
                </p>
              </div>
            )}

            {messages.map((message, index) => {
              const isLastAssistantMessage = message.role === 'assistant' && 
                index === messages.map(m => m.role).lastIndexOf('assistant');
              
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className={`relative group ${message.role === 'assistant' ? 'max-w-[85%]' : 'max-w-[85%]'}`}>
                    {editingMessageId === message.id ? (
                      <div className="bg-muted rounded-lg p-2 space-y-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[60px] text-sm resize-none"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            className="h-7 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(index)}
                            disabled={!editContent.trim() || isStreaming || isGenerating}
                            className="h-7 text-xs"
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Send
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className={`rounded-lg px-3 py-2 ${
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <ExpandableMessage content={message.content} isUser={message.role === 'user'} />
                        </div>
                        {message.role === 'assistant' && (
                          <div className="absolute -bottom-1 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyMessageButton content={message.content} />
                            {isLastAssistantMessage && !isStreaming && (
                              <button
                                onClick={handleRegenerate}
                                disabled={isStreaming || isGenerating}
                                className="p-1 rounded-md bg-background/90 border border-border hover:bg-muted text-xs flex items-center gap-1"
                                title="Regenerate response"
                              >
                                <RotateCcw className="w-3 h-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Retry</span>
                              </button>
                            )}
                          </div>
                        )}
                        {message.role === 'user' && !isStreaming && !editingMessageId && (
                          <div className="absolute -bottom-1 left-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleStartEdit(message)}
                              className="p-1 rounded-md bg-background/90 border border-border hover:bg-muted text-xs flex items-center gap-1"
                              title="Edit message"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Edit</span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {message.role === 'user' && !editingMessageId && (
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Streaming message */}
            {isStreaming && streamingContent && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="rounded-lg px-3 py-2 max-w-[85%] bg-muted">
                  <div className="max-w-none">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]} 
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4 rounded-lg border border-border">
                            <table className="w-full text-sm">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-primary/10">{children}</thead>,
                        th: ({ children }) => (
                          <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border text-xs">{children}</th>
                        ),
                        tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
                        tr: ({ children }) => <tr className="even:bg-muted/30">{children}</tr>,
                        td: ({ children }) => <td className="px-3 py-2 text-muted-foreground text-xs">{children}</td>,
                        p: ({ children }) => <p className="text-sm text-muted-foreground leading-relaxed mb-3 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-outside ml-5 space-y-1.5 text-sm text-muted-foreground mb-3">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-outside ml-5 space-y-1.5 text-sm text-muted-foreground mb-3">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        h1: ({ children }) => <h1 className="font-bold text-base text-foreground mt-4 mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="font-semibold text-sm text-foreground mt-4 mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="font-semibold text-sm text-foreground mt-3 mb-2">{children}</h3>,
                        h4: ({ children }) => <h4 className="font-medium text-sm text-foreground mt-3 mb-1.5">{children}</h4>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        hr: () => <hr className="my-4 border-border" />,
                        code: ({ className, children }) => {
                          const isInline = !className;
                          if (isInline) {
                            return <code className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-xs">{children}</code>;
                          }
                          return <code className="block text-xs font-mono">{children}</code>;
                        },
                        pre: ({ children }) => {
                          const extractText = (node: React.ReactNode): string => {
                            if (typeof node === 'string') return node;
                            if (Array.isArray(node)) return node.map(extractText).join('');
                            if (node && typeof node === 'object' && 'props' in node) {
                              return extractText((node as React.ReactElement).props.children);
                            }
                            return '';
                          };
                          const textContent = extractText(children);
                          return <CodeBlockWithCopy content={textContent}>{children}</CodeBlockWithCopy>;
                        },
                      }}
                    >
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {isStreaming && !streamingContent && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="rounded-lg px-3 py-2 bg-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Modify Formula Button */}
        {messages.length > 0 && (
          <div className="px-4 py-3 border-t border-border space-y-2">
            {/* Progress indicator */}
            {isGenerating && generationProgress && (
              <div className="flex items-center justify-between px-3 py-2 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <div className="absolute inset-0 w-5 h-5 rounded-full border-2 border-primary/20" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      Generating formula...
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {generationProgress.elapsedSeconds < 60
                        ? `${generationProgress.elapsedSeconds}s elapsed`
                        : `${Math.floor(generationProgress.elapsedSeconds / 60)}m ${generationProgress.elapsedSeconds % 60}s elapsed`}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {generationProgress.elapsedSeconds < 30 && "Analyzing changes..."}
                  {generationProgress.elapsedSeconds >= 30 && generationProgress.elapsedSeconds < 60 && "Building document..."}
                  {generationProgress.elapsedSeconds >= 60 && generationProgress.elapsedSeconds < 120 && "Almost there..."}
                  {generationProgress.elapsedSeconds >= 120 && "Finalizing..."}
                </div>
              </div>
            )}
            
            <Button 
              className="w-full"
              onClick={handleGenerateFormula}
              disabled={isStreaming || isGenerating || messages.length === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generating Formula...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Modify Formula Now
                </>
              )}
            </Button>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              placeholder="Discuss formula modifications..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || isGenerating}
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
            />
            <Button 
              size="icon" 
              onClick={handleSend} 
              disabled={!input.trim() || isStreaming || isGenerating}
              className="flex-shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog with Preview */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Save New Formula Version?</DialogTitle>
            <DialogDescription>
              The AI has generated an updated formula with the following changes:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 min-h-0">
            {/* Change Summary */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <p className="text-sm font-medium text-foreground">
                {generatedFormula?.change_summary}
              </p>
            </div>

            {/* Preview Toggle & Content */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Formula Preview</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs"
              >
                {showPreview ? (
                  <>
                    <EyeOff className="w-3 h-3 mr-1" />
                    Hide Preview
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3 mr-1" />
                    Show Preview
                  </>
                )}
              </Button>
            </div>

            {showPreview && generatedFormula?.new_formula_content && (
              <ScrollArea className="h-[400px] border rounded-lg bg-card">
                <div className="p-6 prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {generatedFormula.new_formula_content}
                  </ReactMarkdown>
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setGeneratedFormula(null);
                setShowConfirmDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmSave}
              disabled={isCreatingVersion}
            >
              {isCreatingVersion ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Save Version
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version Switch Confirmation Dialog */}
      <Dialog open={showVersionSwitchDialog} onOpenChange={setShowVersionSwitchDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch Version?</DialogTitle>
            <DialogDescription>
              You have unsent content in your message. Switching versions will clear your current input.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setPendingVersionId(null);
                setShowVersionSwitchDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (pendingVersionId) {
                  setInput("");
                  setActiveVersion(pendingVersionId);
                }
                setPendingVersionId(null);
                setShowVersionSwitchDialog(false);
              }}
            >
              Switch Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
