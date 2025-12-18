import { Badge } from "@/components/ui/badge";
import { GitBranch } from "lucide-react";

interface VersionBadgeProps {
  versionNumber?: number;
  isActive?: boolean;
  changeSummary?: string | null;
  className?: string;
}

export function VersionBadge({ 
  versionNumber, 
  isActive, 
  changeSummary,
  className 
}: VersionBadgeProps) {
  if (!versionNumber) {
    return (
      <Badge variant="outline" className={className}>
        <GitBranch className="w-3 h-3 mr-1" />
        Original
      </Badge>
    );
  }

  return (
    <Badge 
      variant={isActive ? "default" : "secondary"} 
      className={className}
    >
      <GitBranch className="w-3 h-3 mr-1" />
      v{versionNumber}
      {isActive && <span className="ml-1 text-xs opacity-75">(Active)</span>}
    </Badge>
  );
}
