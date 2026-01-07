import { useState } from 'react';
import { format } from 'date-fns';
import { History, Trash2, Eye, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { MockupHistoryItem } from '@/hooks/useMockupHistory';

interface MockupHistoryGalleryProps {
  history: MockupHistoryItem[];
  isLoading: boolean;
  onRestore: (imageUrl: string) => void;
  onDelete: (id: string) => void;
}

export function MockupHistoryGallery({
  history,
  isLoading,
  onRestore,
  onDelete
}: MockupHistoryGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<MockupHistoryItem | null>(null);

  if (history.length === 0 && !isLoading) {
    return null;
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History ({history.length})
            </span>
            <span className="text-xs">
              {isOpen ? 'Hide' : 'Show'}
            </span>
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="pt-2">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-2">
              {isLoading ? (
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 w-20 rounded-md bg-muted animate-pulse flex-shrink-0"
                    />
                  ))}
                </div>
              ) : (
                history.map((item) => (
                  <TooltipProvider key={item.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="group relative flex-shrink-0">
                          <div
                            className="h-20 w-20 rounded-md border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                            onClick={() => setPreviewItem(item)}
                          >
                            <img
                              src={item.image_url}
                              alt={`Mockup from ${format(new Date(item.created_at), 'MMM d')}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 rounded-md">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewItem(item);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRestore(item.image_url);
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(item.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-background/90 text-[10px] text-center py-0.5 truncate px-1">
                            {format(new Date(item.created_at), 'MMM d')}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <div className="space-y-1 text-xs">
                          <p className="font-medium">
                            {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                          {item.packaging_format && (
                            <p className="text-muted-foreground">
                              {item.packaging_format}
                            </p>
                          )}
                          {item.design_settings?.colors?.primary && (
                            <div className="flex items-center gap-1">
                              <div
                                className="h-3 w-3 rounded-full border"
                                style={{ backgroundColor: item.design_settings.colors.primary }}
                              />
                              <span className="text-muted-foreground">
                                {item.design_settings.colors.primary}
                              </span>
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>

      {/* Full Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                Mockup from {previewItem && format(new Date(previewItem.created_at), 'MMMM d, yyyy')}
              </span>
              {previewItem?.packaging_format && (
                <Badge variant="secondary">{previewItem.packaging_format}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {previewItem && (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={previewItem.image_url}
                  alt="Mockup preview"
                  className="w-full h-auto"
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    onDelete(previewItem.id);
                    setPreviewItem(null);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button
                  onClick={() => {
                    onRestore(previewItem.image_url);
                    setPreviewItem(null);
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Use This Mockup
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
