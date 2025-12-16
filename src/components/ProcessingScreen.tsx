import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Lottie from "lottie-react";

// Inline minimal scanner animation data
const scannerAnimation = {
  v: "5.5.7",
  fr: 30,
  ip: 0,
  op: 60,
  w: 200,
  h: 200,
  nm: "Scanner",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Circle",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 1, k: [{ t: 0, s: [0], e: [360] }, { t: 60, s: [360] }] },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: "el",
          s: { a: 0, k: [80, 80] },
          p: { a: 0, k: [0, 0] },
          nm: "Ellipse",
        },
        {
          ty: "st",
          c: { a: 0, k: [0.055, 0.647, 0.914, 1] },
          o: { a: 0, k: 100 },
          w: { a: 0, k: 4 },
          lc: 2,
          lj: 1,
          d: [{ n: "d", v: { a: 0, k: 20 } }, { n: "g", v: { a: 0, k: 10 } }],
          nm: "Stroke",
        },
      ],
      ip: 0,
      op: 60,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: "Pulse",
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [100], e: [0] }, { t: 60, s: [0] }] },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [50, 50, 100], e: [150, 150, 100] }, { t: 60, s: [150, 150, 100] }] },
      },
      ao: 0,
      shapes: [
        {
          ty: "el",
          s: { a: 0, k: [80, 80] },
          p: { a: 0, k: [0, 0] },
          nm: "Ellipse",
        },
        {
          ty: "st",
          c: { a: 0, k: [0.055, 0.647, 0.914, 1] },
          o: { a: 0, k: 100 },
          w: { a: 0, k: 2 },
          nm: "Stroke",
        },
      ],
      ip: 0,
      op: 60,
    },
  ],
};

interface ProcessingScreenProps {
  categoryName: string;
  onRefresh: () => void;
  isRefetching?: boolean;
}

export default function ProcessingScreen({ categoryName, onRefresh, isRefetching }: ProcessingScreenProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full border-2 border-accent/20">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <div className="w-40 h-40 mx-auto">
            <Lottie
              animationData={scannerAnimation}
              loop={true}
              className="w-full h-full"
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Analyzing Market Data
            </h2>
            <p className="text-muted-foreground">
              Our AI Agents are currently scraping Amazon and analyzing competitors for{" "}
              <span className="font-medium text-accent">{categoryName}</span>.
            </p>
            <p className="text-sm text-muted-foreground">
              This usually takes 5-8 minutes.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Auto-refreshing every 30 seconds...</span>
          </div>

          <Button
            onClick={onRefresh}
            variant="outline"
            className="gap-2 transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:scale-105"
            disabled={isRefetching}
          >
            {isRefetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh Status
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
