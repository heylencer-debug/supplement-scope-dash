import { useState } from 'react';
import { format } from 'date-fns';
import { History, Trash2, Eye, RotateCcw, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
import { SkeletonShimmer } from '@/components/ui/loading-indicator';
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
import { FlatLayoutHistoryItem } from '@/hooks/useFlatLayoutHistory';

interface FlatLayoutHistoryGalleryProps {
  history: FlatLayoutHistoryItem[];
  isLoading: boolean;
  onRestore: (imageUrl: string) => void;
  onDelete: (id: string) => void;
  // Pagination props
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
}

export function FlatLayoutHistoryGallery({
  history,
  isLoading,
  onRestore,
  onDelete,
  currentPage = 1,
  totalPages = 1,
  totalCount = 0,
  onNextPage,
  onPrevPage,
  hasNextPage = false,
  hasPrevPage = false
}: FlatLayoutHistoryGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<FlatLayoutHistoryItem | null>(null);

  if (totalCount === 0 && !isLoading) {
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
              <LayoutGrid className="h-4 w-4" />
              Flat Layout History ({totalCount})
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
                  {[1, 2, 3, 4, 5].map((i) => (
                    <SkeletonShimmer
                      key={i}
                      className="h-20 w-20 flex-shrink-0"
                      variant="rectangular"
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
                            className="h-20 w-20 rounded-md border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all bg-muted"
                            onClick={() => setPreviewItem(item)}
                          >
                            <img
                              src={item.image_url}
                              alt={`Flat layout from ${format(new Date(item.created_at), 'MMM d')}`}
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
                          {item.design_settings?.layout_mode === 'front_only' && (
                            <Badge 
                              variant="secondary" 
                              className="absolute top-0.5 right-0.5 text-[8px] h-4 px-1"
                            >
                              Front
                            </Badge>
                          )}
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
                          <p className="text-muted-foreground">
                            {item.design_settings?.layout_mode === 'front_only' ? 'Front Panel Only' : 'Full Dieline'}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onPrevPage}
                  disabled={!hasPrevPage || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onNextPage}
                  disabled={!hasNextPage || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Full Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                Flat Layout from {previewItem && format(new Date(previewItem.created_at), 'MMMM d, yyyy')}
              </span>
              <div className="flex gap-2">
                {previewItem?.design_settings?.layout_mode === 'front_only' && (
                  <Badge variant="secondary">Front Panel Only</Badge>
                )}
                {previewItem?.packaging_format && (
                  <Badge variant="outline">{previewItem.packaging_format}</Badge>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {previewItem && (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden border bg-muted">
                <img
                  src={previewItem.image_url}
                  alt="Flat layout preview"
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
                  Use This Layout
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
