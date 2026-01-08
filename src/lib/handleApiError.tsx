import React from "react";
import { toast } from "@/hooks/use-toast";

interface ApiErrorOptions {
  fallbackTitle?: string;
  fallbackDescription?: string;
}

/**
 * Handles API errors with friendly messages for billing/rate-limit issues.
 * Returns true if it was a handled billing error, false otherwise.
 */
export function handleApiError(
  error: unknown,
  options: ApiErrorOptions = {}
): boolean {
  const { 
    fallbackTitle = "Request Failed", 
    fallbackDescription = "Something went wrong. Please try again." 
  } = options;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Handle 402 - Payment Required / Credits Exhausted
  if (
    lowerMessage.includes("402") ||
    lowerMessage.includes("credits exhausted") ||
    lowerMessage.includes("payment required") ||
    lowerMessage.includes("add credits")
  ) {
    toast({
      title: "API Credits Exhausted",
      description: "Your OpenRouter credits have run out. Please add credits to continue generating images.",
      variant: "destructive",
      action: (
        <a
          href="https://openrouter.ai/credits"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add Credits
        </a>
      ),
    });
    return true;
  }

  // Handle 429 - Rate Limited
  if (
    lowerMessage.includes("429") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many requests")
  ) {
    toast({
      title: "Rate Limit Reached",
      description: "Too many requests. Please wait a moment and try again.",
      variant: "destructive",
    });
    return true;
  }

  // Generic fallback
  toast({
    title: fallbackTitle,
    description: errorMessage || fallbackDescription,
    variant: "destructive",
  });
  return false;
}
