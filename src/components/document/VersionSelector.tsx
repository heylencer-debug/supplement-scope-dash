import { useState } from "react";
import { ChevronDown, History, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormulaBriefVersion } from "@/hooks/useFormulaBriefVersions";

interface VersionSelectorProps {
  versions: FormulaBriefVersion[];
  activeVersion: FormulaBriefVersion | null;
  onSelectVersion: (versionId: string) => void;
  isLoading?: boolean;
  hasOriginal?: boolean;
}

export function VersionSelector({
  versions,
  activeVersion,
  onSelectVersion,
  isLoading,
  hasOriginal = true
}: VersionSelectorProps) {
  const [open, setOpen] = useState(false);

  const displayLabel = activeVersion 
    ? `v${activeVersion.version_number}` 
    : hasOriginal ? "Original" : "No versions";

  const getVersionLabel = (version: FormulaBriefVersion) => {
    const label = `v${version.version_number}`;
    if (version.change_summary) {
      const truncated = version.change_summary.length > 30 
        ? version.change_summary.slice(0, 30) + "..." 
        : version.change_summary;
      return `${label} - ${truncated}`;
    }
    return label;
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 min-w-[100px]"
          disabled={isLoading}
        >
          <History className="w-4 h-4" />
          {displayLabel}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        <DropdownMenuLabel className="flex items-center gap-2">
          <History className="w-4 h-4" />
          Version History
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {hasOriginal && (
          <DropdownMenuItem
            onClick={() => {
              // Deactivate all versions to show original
              if (activeVersion) {
                onSelectVersion("original");
              }
              setOpen(false);
            }}
            className="flex items-center justify-between"
          >
            <span>Original</span>
            {!activeVersion && <Check className="w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        )}
        
        {versions.length > 0 && hasOriginal && <DropdownMenuSeparator />}
        
        {versions.map((version) => (
          <DropdownMenuItem
            key={version.id}
            onClick={() => {
              onSelectVersion(version.id);
              setOpen(false);
            }}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span>{getVersionLabel(version)}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(version.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </span>
            </div>
            {activeVersion?.id === version.id && (
              <Check className="w-4 h-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        
        {versions.length === 0 && !hasOriginal && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No versions created yet
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
