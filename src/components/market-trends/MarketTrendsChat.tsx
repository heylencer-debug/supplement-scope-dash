import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Sparkles } from "lucide-react";
import { ChatBubble, QuickReplies, ChatHeader, ChatInput } from "@/components/ui/chat-bubble";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MarketTrendsChatProps {
  categoryId: string;
  categoryName: string;
}

const SUGGESTED_QUESTIONS = [
  "Top growth opportunities?",
  "Trending brands?",
  "Consumer complaints?",
  "Market innovations?",
  "Competitive analysis?",
];

export function MarketTrendsChat({ categoryId, categoryName }: MarketTrendsChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `👋 Hello! I'm your Market Insights AI.\n\nAsk me anything about the **${categoryName}** market analysis. I can help you understand trends, opportunities, competitive landscape, and more.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = async (questionText?: string) => {
    const question = questionText || input.trim();
    if (!question || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Create assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: "assistant", content: "" },
    ]);

    try {
      // Build conversation history (exclude welcome message)
      const conversationHistory = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(
        `https://jwkitkfufigldpldqtbq.supabase.co/functions/v1/ask-market-trends`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3a2l0a2Z1ZmlnbGRwbGRxdGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNDU2NDUsImV4cCI6MjA3NjYyMTY0NX0.VziSAuTdqcteRERIPCdrMy4vqQuHjeC3tvazE0E8nMM`,
          },
          body: JSON.stringify({
            categoryId,
            question,
            conversationHistory,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  accumulatedContent += content;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, content: accumulatedContent }
                        : m
                    )
                  );
                }
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content:
                  "Sorry, I encountered an error. Please try again.",
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const showQuickReplies = messages.length === 1;

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* Header */}
      <ChatHeader
        title="Market Insights AI"
        subtitle="Online Now"
        icon={<Bot className="w-5 h-5 text-primary-foreground" />}
      />

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 py-4">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={message.id}>
              <ChatBubble
                role={message.role}
                content={message.content}
                isLoading={isLoading && message.role === "assistant" && index === messages.length - 1}
              />
              {/* Show quick replies after welcome message */}
              {message.id === "welcome" && showQuickReplies && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2 ml-12">
                    <Sparkles className="w-3 h-3" />
                    Suggested questions:
                  </p>
                  <QuickReplies
                    options={SUGGESTED_QUESTIONS}
                    onSelect={handleSend}
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={() => handleSend()}
        placeholder="Ask about the market analysis..."
        disabled={isLoading}
        isLoading={isLoading}
      />
    </div>
  );
}
