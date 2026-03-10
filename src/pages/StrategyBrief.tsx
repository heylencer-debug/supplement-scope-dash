import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function StrategyBrief() {
  return (
    <div className="max-w-2xl mx-auto py-20 flex flex-col items-center justify-center space-y-6 text-center">
      <div className="p-4 rounded-full bg-primary/10">
        <FileText className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-3xl font-bold text-foreground">Strategy Brief</h1>
      <p className="text-muted-foreground text-lg">
        Phase 5 deep research powered by Scout — coming soon.
      </p>
      <Card className="w-full border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">
            Strategy briefs will be generated from Scout's Phase 5 deep research data, including competitive positioning, formula gaps, and launch readiness scoring.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
