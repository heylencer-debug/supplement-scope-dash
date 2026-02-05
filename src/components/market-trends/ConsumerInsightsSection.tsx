import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MessageCircle, Heart, Lightbulb, Tag } from "lucide-react";

interface ConsumerInsightsData {
  useCases: string[];
  praisesComplaints: string;
  preferredAttributes: string[];
  emergingBehaviors: string;
}

interface ConsumerInsightsSectionProps {
  data: ConsumerInsightsData;
}

export function ConsumerInsightsSection({ data }: ConsumerInsightsSectionProps) {
  return (
    <div className="space-y-6">
      {/* Use Cases */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Primary Use Cases</CardTitle>
          </div>
          <CardDescription>How consumers are using products in this category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.useCases.map((useCase, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{index + 1}</span>
                </div>
                <p className="text-sm text-foreground">{useCase}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preferred Attributes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-chart-4" />
            <CardTitle className="text-lg">Preferred Product Attributes</CardTitle>
          </div>
          <CardDescription>Key features consumers value most</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.preferredAttributes.map((attr, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="py-2 px-4 text-sm bg-chart-4/10 text-chart-4 border-chart-4/20"
              >
                <Heart className="h-3 w-3 mr-1.5 fill-current" />
                {attr}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Praises & Complaints */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-chart-2" />
            <CardTitle className="text-lg">Customer Feedback Summary</CardTitle>
          </div>
          <CardDescription>Common praises and complaints from reviews</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{data.praisesComplaints}</p>
        </CardContent>
      </Card>

      {/* Emerging Behaviors */}
      <Card className="bg-gradient-to-br from-chart-1/5 to-chart-1/10 border-chart-1/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-chart-1" />
            <CardTitle className="text-lg">Emerging Consumer Behaviors</CardTitle>
          </div>
          <CardDescription>New patterns and behaviors to watch</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-foreground leading-relaxed">{data.emergingBehaviors}</p>
        </CardContent>
      </Card>
    </div>
  );
}
