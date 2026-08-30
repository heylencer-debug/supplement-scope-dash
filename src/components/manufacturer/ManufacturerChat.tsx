/**
 * ManufacturerChat — a fixed-chrome card hosting the shared <ChatThread>.
 *
 * Still used by ManufacturerPortalInternal.tsx's Chat tab (and the orphaned
 * ManufacturerFeedbackPage.tsx). The Dashboard's Manufacturer tab no longer
 * renders this inline — that chat now lives in the floating
 * <FormulatorAgent> (src/components/formulator/FormulatorAgent.tsx), mounted
 * once at the Layout level so it follows the selected category across every
 * tab. Both consume the same ChatThread internals — see that file's header
 * comment for why the extraction happened.
 *
 * Kept tall (~70vh, min 560px) so the composer never gets crushed against a
 * two-line-tall thread — the original complaint that started this pass.
 */
import { ChatThread } from "@/components/manufacturer/ChatThread";

interface ManufacturerChatProps {
  categoryId: string;
  keyword: string;
}

export function ManufacturerChat({ categoryId, keyword }: ManufacturerChatProps) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card shadow-sm overflow-hidden h-[70vh] min-h-[560px] flex flex-col">
      <ChatThread categoryId={categoryId} keyword={keyword} className="h-full" />
    </div>
  );
}

export default ManufacturerChat;
