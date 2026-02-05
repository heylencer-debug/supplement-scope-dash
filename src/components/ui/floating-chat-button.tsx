import * as React from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FloatingChatButtonProps {
  onClick: () => void;
  show: boolean;
  icon?: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

export function FloatingChatButton({
  onClick,
  show,
  icon,
  pulse = true,
  className,
}: FloatingChatButtonProps) {
  if (!show) return null;

  return (
    <Button
      size="lg"
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 group print:hidden",
        className
      )}
    >
      {pulse && (
        <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
      )}
      <span className="relative z-10 group-hover:scale-110 transition-transform flex items-center justify-center">
        {icon || <MessageCircle className="h-6 w-6" />}
      </span>
    </Button>
  );
}
