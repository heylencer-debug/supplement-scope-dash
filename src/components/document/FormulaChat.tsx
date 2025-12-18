import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useFormulaConversation, Message } from "@/hooks/useFormulaConversation";
import { useFormulaBriefVersions } from "@/hooks/useFormulaBriefVersions";
import { supabase } from "@/integrations/supabase/client";

interface FormulaChatProps {
  categoryId: string;
  currentFormula: string;
  onClose: () => void;
  onVersionCreated?: () => void;
}

interface PendingChanges {
  ready_to_apply: boolean;
  change_summary: string;
  new_formula_content: string;
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
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingChanges, setPendingChanges] = useState<PendingChanges | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { conversation, addMessage, clearConversation, isLoading } = useFormulaConversation(categoryId);
  const { createVersion, activeVersion, isCreatingVersion } = useFormulaBriefVersions(categoryId);

  const messages = conversation?.messages || [];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const parseAIResponse = (content: string): PendingChanges | null => {
    // Look for JSON block at the end of the response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```\s*$/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.ready_to_apply && parsed.new_formula_content) {
          return parsed as PendingChanges;
        }
      } catch {
        // JSON parsing failed, no changes to apply
      }
    }
    return null;
  };

  const getDisplayContent = (content: string): string => {
    // Remove the JSON block from displayed content
    return content.replace(/```json\s*[\s\S]*?\s*```\s*$/, "").trim();
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setInput("");
    setStreamingContent("");
    setPendingChanges(null);

    // Add user message to conversation
    await addMessage({ categoryId, message: userMessage });

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
            currentFormula
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                setStreamingContent(fullContent);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      // Check for pending changes in the response
      const changes = parseAIResponse(fullContent);
      if (changes) {
        setPendingChanges(changes);
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

  const handleApplyChanges = async () => {
    if (!pendingChanges) return;

    try {
      await createVersion({
        categoryId,
        formulaBriefContent: pendingChanges.new_formula_content,
        changeSummary: pendingChanges.change_summary,
        parentVersionId: activeVersion?.id
      });

      toast({
        title: "Version created",
        description: `New formula version created: ${pendingChanges.change_summary}`
      });

      setPendingChanges(null);
      onVersionCreated?.();
    } catch (error) {
      console.error('Error creating version:', error);
      toast({
        title: "Error",
        description: "Failed to create new version. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleClearConversation = async () => {
    if (!conversation?.id) return;
    
    try {
      await clearConversation(conversation.id);
      setPendingChanges(null);
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

  return (
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
        </div>
        <div className="flex items-center gap-1">
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

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-8">
              <Bot className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h4 className="font-medium text-foreground mb-1">Formula AI Assistant</h4>
              <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
                Ask me to modify ingredients, adjust dosages, add new components, or change any aspect of your formula.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={`rounded-lg px-3 py-2 max-w-[85%] ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">
                  {getDisplayContent(message.content)}
                </p>
              </div>
              {message.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="rounded-lg px-3 py-2 max-w-[85%] bg-muted">
                <p className="text-sm whitespace-pre-wrap">
                  {getDisplayContent(streamingContent)}
                </p>
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

      {/* Apply Changes Banner */}
      {pendingChanges && (
        <div className="px-4 py-3 border-t border-border bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Ready to apply changes</p>
              <p className="text-xs text-muted-foreground truncate">
                {pendingChanges.change_summary}
              </p>
            </div>
            <Button 
              size="sm" 
              onClick={handleApplyChanges}
              disabled={isCreatingVersion}
              className="flex-shrink-0"
            >
              {isCreatingVersion ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Ask to modify the formula..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            className="min-h-[44px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button 
            size="icon" 
            onClick={handleSend} 
            disabled={!input.trim() || isStreaming}
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
  );
}
