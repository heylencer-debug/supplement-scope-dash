import * as React from "react";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
  avatar?: React.ReactNode;
  className?: string;
}

export function ChatBubble({ 
  role, 
  content, 
  isLoading,
  avatar,
  className 
}: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-in",
        isUser ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-gradient-to-br from-primary/80 to-primary text-primary-foreground"
        )}
      >
        {avatar || (isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />)}
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card border border-border rounded-bl-md"
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed">{content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-card-foreground">
            {isLoading && !content ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => (
                    <p className="text-sm leading-relaxed mb-2 last:mb-0 text-foreground">{children}</p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-foreground">{children}</strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside ml-4 space-y-1 text-sm text-foreground mb-2">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside ml-4 space-y-1 text-sm text-foreground mb-2">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed">{children}</li>
                  ),
                  h1: ({ children }) => (
                    <h1 className="font-bold text-base text-foreground mt-3 mb-2">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="font-semibold text-sm text-foreground mt-3 mb-1.5">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="font-medium text-sm text-foreground mt-2 mb-1">{children}</h3>
                  ),
                  code: ({ className, children }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-xs">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className="block text-xs font-mono">{children}</code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="p-3 rounded-lg bg-muted/80 border border-border overflow-x-auto text-xs my-2">
                      {children}
                    </pre>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-3 rounded-lg border border-border">
                      <table className="w-full text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-muted/50">{children}</thead>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border text-xs">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 text-muted-foreground text-xs border-b border-border/50">{children}</td>
                  ),
                }}
              >
                {content || "..."}
              </ReactMarkdown>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface QuickRepliesProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export function QuickReplies({ options, onSelect, disabled }: QuickRepliesProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-3 ml-12">
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => onSelect(option)}
          disabled={disabled}
          className={cn(
            "text-xs px-4 py-2 rounded-full border border-border bg-card",
            "hover:bg-primary hover:text-primary-foreground hover:border-primary",
            "transition-all duration-200 shadow-sm",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:text-foreground disabled:hover:border-border"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose?: () => void;
}

export function ChatHeader({ title, subtitle, icon, onClose }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shadow-sm">
          {icon || <Bot className="w-5 h-5 text-primary-foreground" />}
        </div>
        <div>
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse" />
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function ChatInput({ 
  value, 
  onChange, 
  onSend, 
  placeholder = "Type your message...",
  disabled,
  isLoading 
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t border-border p-4 bg-card/30">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex-1 min-h-[44px] max-h-[120px] px-4 py-3 rounded-2xl resize-none",
            "bg-muted/50 border border-border",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
            "text-sm placeholder:text-muted-foreground",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          rows={1}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim() || isLoading}
          className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "shadow-md"
          )}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" 
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
