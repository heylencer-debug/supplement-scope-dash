/**
 * GenerateFormulaBriefButton — the "on-demand formula chain" entry point
 * (2026-09-01). Default Launchpad runs now stop after the research scope
 * (P1-P8); this button queues a continuation scout_jobs row (from_phase=9,
 * SAME category/session keyword — never a new "#N" spawn) to run the
 * formula chain: Formula Brief, QA, Competitive Benchmarking, FDA
 * Compliance, Final Sign-off.
 *
 * The exact keyword matters — session isolation matches scout_jobs.keyword
 * against categories.search_term VERBATIM (including any "#N" session
 * suffix), never the cosmetic display name. This component resolves
 * search_term from categoryId right before submitting instead of trusting
 * whatever display name a caller passes in.
 */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { PearlButton } from "@/components/ui/pearl-button";
import { BrandLoader } from "@/components/ui/brand-loader";
import { supabase } from "@/integrations/supabase/client";
import { useGenerateFormulaBrief } from "@/hooks/useScoutJobs";
import { toast } from "@/hooks/use-toast";

interface Props {
  categoryId: string;
  className?: string;
  label?: string;
}

export function GenerateFormulaBriefButton({ categoryId, className, label = "Generate formula brief" }: Props) {
  const generate = useGenerateFormulaBrief();
  const [resolving, setResolving] = useState(false);

  const handleClick = async () => {
    setResolving(true);
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("search_term, name")
        .eq("id", categoryId)
        .maybeSingle();
      if (error || !data) {
        toast({ title: "Couldn't resolve this category's keyword", description: error?.message, variant: "destructive" });
        return;
      }
      const keyword = data.search_term || data.name;
      if (!keyword) {
        toast({ title: "This category has no keyword to run against", variant: "destructive" });
        return;
      }
      await generate.mutateAsync({ keyword });
    } finally {
      setResolving(false);
    }
  };

  const busy = resolving || generate.isPending;

  return (
    <PearlButton onClick={handleClick} disabled={busy} className={className}>
      {busy ? <BrandLoader size={14} className="mr-1.5" label="Starting" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
      {label}
    </PearlButton>
  );
}
