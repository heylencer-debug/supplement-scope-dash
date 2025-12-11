import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { ToastSuccessIcon, ToastErrorIcon, ToastWarningIcon, ToastInfoIcon, ToastProgress } from "@/components/ui/toast-icons";

export function Toaster() {
  const { toasts } = useToast();

  const getIcon = (variant?: string) => {
    switch (variant) {
      case "destructive":
        return <ToastErrorIcon />;
      case "success":
        return <ToastSuccessIcon />;
      case "warning":
        return <ToastWarningIcon />;
      default:
        return <ToastInfoIcon />;
    }
  };

  const getProgressVariant = (variant?: string) => {
    switch (variant) {
      case "destructive":
        return "destructive";
      case "success":
        return "success";
      case "warning":
        return "warning";
      default:
        return "default";
    }
  };

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex items-start gap-3">
              {getIcon(variant as string)}
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
            <ToastProgress variant={getProgressVariant(variant as string)} duration={5000} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
