import { cn } from "@/lib/utils";

interface ToastIconProps {
  className?: string;
}

// Animated success checkmark
export function ToastSuccessIcon({ className }: ToastIconProps) {
  return (
    <div className={cn("relative w-6 h-6", className)}>
      {/* Background circle */}
      <svg
        className="absolute inset-0 w-full h-full animate-circle-scale"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          className="fill-green-100 dark:fill-green-900/30"
        />
      </svg>
      {/* Checkmark */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M7 13l3 3 7-7"
          className="stroke-green-600 dark:stroke-green-400 animate-checkmark-draw"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
          strokeDashoffset="100"
        />
      </svg>
    </div>
  );
}

// Animated error X icon
export function ToastErrorIcon({ className }: ToastIconProps) {
  return (
    <div className={cn("relative w-6 h-6", className)}>
      {/* Background circle */}
      <svg
        className="absolute inset-0 w-full h-full animate-circle-scale"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          className="fill-red-100 dark:fill-red-900/30"
        />
      </svg>
      {/* X mark */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M8 8l8 8M16 8l-8 8"
          className="stroke-red-600 dark:stroke-red-400 animate-x-draw"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
          strokeDashoffset="100"
        />
      </svg>
    </div>
  );
}

// Animated warning icon
export function ToastWarningIcon({ className }: ToastIconProps) {
  return (
    <div className={cn("relative w-6 h-6", className)}>
      {/* Background triangle */}
      <svg
        className="absolute inset-0 w-full h-full animate-circle-scale"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 3L2 21h20L12 3z"
          className="fill-amber-100 dark:fill-amber-900/30"
        />
      </svg>
      {/* Exclamation mark */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 9v4M12 17h.01"
          className="stroke-amber-600 dark:stroke-amber-400 animate-checkmark-draw"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
          strokeDashoffset="100"
        />
      </svg>
    </div>
  );
}

// Animated info icon
export function ToastInfoIcon({ className }: ToastIconProps) {
  return (
    <div className={cn("relative w-6 h-6", className)}>
      {/* Background circle */}
      <svg
        className="absolute inset-0 w-full h-full animate-circle-scale"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          className="fill-blue-100 dark:fill-blue-900/30"
        />
      </svg>
      {/* Info mark */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 16v-4M12 8h.01"
          className="stroke-blue-600 dark:stroke-blue-400 animate-checkmark-draw"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
          strokeDashoffset="100"
        />
      </svg>
    </div>
  );
}

// Progress bar component
interface ToastProgressProps {
  duration?: number;
  variant?: "default" | "destructive" | "success" | "warning";
  className?: string;
}

export function ToastProgress({ duration = 5000, variant = "default", className }: ToastProgressProps) {
  const variantColors = {
    default: "bg-primary",
    destructive: "bg-red-500",
    success: "bg-green-500",
    warning: "bg-amber-500",
  };

  return (
    <div className={cn("absolute bottom-0 left-0 right-0 h-1 bg-muted/30 overflow-hidden rounded-b-md", className)}>
      <div
        className={cn("h-full animate-countdown", variantColors[variant])}
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}
