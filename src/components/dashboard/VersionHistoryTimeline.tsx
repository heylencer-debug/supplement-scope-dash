import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GitBranch, ChevronDown, ChevronUp, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface FormulaBriefVersion {
  id: string;
  category_id: string;
  version_number: number;
  formula_brief_content: string;
  change_summary: string | null;
  is_active: boolean;
  parent_version_id: string | null;
  created_at: string;
}

interface VersionHistoryTimelineProps {
  versions: FormulaBriefVersion[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string | null) => void;
}

export function VersionHistoryTimeline({ 
  versions, 
  selectedVersionId, 
  onSelectVersion 
}: VersionHistoryTimelineProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (versions.length === 0) return null;

  // Sort versions by version_number descending (newest first)
  const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border border-border rounded-lg bg-card">
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Version History</span>
              <Badge variant="secondary" className="text-xs">
                {versions.length} version{versions.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />

              {/* Version items */}
              <div className="space-y-3">
                {sortedVersions.map((version, index) => {
                  const isSelected = selectedVersionId === version.id;
                  const isOriginal = version.version_number === 1 && !version.change_summary;
                  
                  return (
                    <div 
                      key={version.id}
                      className="relative pl-8"
                    >
                      {/* Timeline dot */}
                      <div 
                        className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          version.is_active 
                            ? 'bg-primary border-primary' 
                            : isSelected 
                              ? 'bg-chart-4 border-chart-4'
                              : 'bg-background border-border'
                        }`}
                      >
                        {version.is_active ? (
                          <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
                        ) : (
                          <span className={`text-[10px] font-medium ${isSelected ? 'text-white' : 'text-muted-foreground'}`}>
                            {version.version_number}
                          </span>
                        )}
                      </div>

                      {/* Version card */}
                      <button
                        onClick={() => onSelectVersion(version.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          isSelected 
                            ? 'bg-primary/5 border-primary/30' 
                            : 'bg-muted/30 border-transparent hover:bg-muted/50 hover:border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground">
                              {isOriginal ? 'Original' : `Version ${version.version_number}`}
                            </span>
                            {version.is_active && (
                              <Badge variant="default" className="text-[10px] h-5">
                                Active
                              </Badge>
                            )}
                            {isSelected && !version.is_active && (
                              <Badge variant="outline" className="text-[10px] h-5">
                                Viewing
                              </Badge>
                            )}
                          </div>
                        </div>

                        {version.change_summary && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                            {version.change_summary}
                          </p>
                        )}

                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {format(new Date(version.created_at), 'MMM d, yyyy • h:mm a')}
                        </div>
                      </button>
                    </div>
                  );
                })}

                {/* Original analysis marker */}
                <div className="relative pl-8">
                  <div 
                    className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      !selectedVersionId 
                        ? 'bg-chart-4 border-chart-4'
                        : 'bg-background border-border'
                    }`}
                  >
                    <GitBranch className={`w-3 h-3 ${!selectedVersionId ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>

                  <button
                    onClick={() => onSelectVersion(null)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      !selectedVersionId 
                        ? 'bg-primary/5 border-primary/30' 
                        : 'bg-muted/30 border-transparent hover:bg-muted/50 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-foreground">Original Analysis</span>
                      {!selectedVersionId && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          Viewing
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Initial formula brief generated from market analysis
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
