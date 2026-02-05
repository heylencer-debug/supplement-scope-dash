import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MessageCircle, Heart, Lightbulb, Tag, ThumbsUp, ThumbsDown, Sparkles } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ScrollAnimate } from "@/components/ui/scroll-animate";

interface ConsumerInsightsData {
  useCases: string[];
  praisesComplaints: string;
  preferredAttributes: string[];
  emergingBehaviors: string;
}

interface ConsumerInsightsSectionProps {
  data: ConsumerInsightsData;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const useCaseIcons = [Users, Heart, Sparkles, Tag, Lightbulb];

export function ConsumerInsightsSection({ data }: ConsumerInsightsSectionProps) {
  // Create bubble chart data for attributes
  const attributeData = data.preferredAttributes.map((attr, index) => ({
    name: attr,
    value: Math.max(100 - index * 15, 30),
    color: COLORS[index % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Use Cases with Visual Cards */}
      <ScrollAnimate variant="fade-up">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Primary Use Cases</CardTitle>
            </div>
            <CardDescription>How consumers are using products in this category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.useCases.map((useCase, index) => {
                const IconComponent = useCaseIcons[index % useCaseIcons.length];
                return (
                  <div
                    key={index}
                    className="group relative p-4 rounded-xl bg-gradient-to-br from-secondary/40 to-secondary/20 border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-300"
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftColor: COLORS[index % COLORS.length],
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                        style={{ backgroundColor: `${COLORS[index % COLORS.length]}20` }}
                      >
                        <IconComponent
                          className="h-5 w-5"
                          style={{ color: COLORS[index % COLORS.length] }}
                        />
                      </div>
                      <div>
                        <Badge variant="outline" className="mb-2 text-xs" style={{ borderColor: COLORS[index % COLORS.length], color: COLORS[index % COLORS.length] }}>
                          Use Case {index + 1}
                        </Badge>
                        <p className="text-sm text-foreground leading-relaxed">{useCase}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </ScrollAnimate>

      {/* Preferred Attributes with Bubble Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScrollAnimate variant="scale-up" delay={100}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-chart-4" />
                <CardTitle className="text-lg">Attribute Importance</CardTitle>
              </div>
              <CardDescription>Visual weight of customer preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={attributeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {attributeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ payload }) => {
                        if (payload && payload[0]) {
                          return (
                            <div className="bg-popover border rounded-lg p-2 shadow-lg">
                              <p className="font-medium">{(payload[0].payload as any).name}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </ScrollAnimate>

        <ScrollAnimate variant="scale-up" delay={200}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-chart-4 fill-chart-4" />
                <CardTitle className="text-lg">Preferred Attributes</CardTitle>
              </div>
              <CardDescription>Key features consumers value most</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.preferredAttributes.map((attr, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="py-2 px-4 text-sm hover:scale-105 transition-transform cursor-default"
                    style={{
                      backgroundColor: `${COLORS[index % COLORS.length]}10`,
                      borderColor: `${COLORS[index % COLORS.length]}50`,
                      color: COLORS[index % COLORS.length],
                    }}
                  >
                    <Heart className="h-3 w-3 mr-1.5 fill-current" />
                    {attr}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </ScrollAnimate>
      </div>

      {/* Praises & Complaints with Sentiment Visual */}
      <ScrollAnimate variant="fade-up" delay={300}>
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-chart-2" />
              <CardTitle className="text-lg">Customer Feedback Summary</CardTitle>
            </div>
            <CardDescription>Common praises and complaints from reviews</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <Badge variant="outline" className="bg-chart-4/10 text-chart-4 border-chart-4/30 py-1.5">
                <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                Praises
              </Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 py-1.5">
                <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
                Complaints
              </Badge>
            </div>
            <div className="p-4 rounded-lg bg-secondary/20 border border-border/50">
              <p className="text-foreground leading-relaxed">{data.praisesComplaints}</p>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimate>

      {/* Emerging Behaviors */}
      <ScrollAnimate variant="fade-up" delay={400}>
        <Card className="overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-chart-1/5 to-chart-4/5 pointer-events-none" />
          <CardHeader className="relative">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-chart-1/10 animate-pulse">
                <Lightbulb className="h-5 w-5 text-chart-1" />
              </div>
              <div>
                <CardTitle className="text-lg">Emerging Consumer Behaviors</CardTitle>
                <CardDescription>New patterns and behaviors to watch</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="p-4 rounded-lg bg-background/80 backdrop-blur-sm border border-chart-1/20">
              <p className="text-foreground leading-relaxed">{data.emergingBehaviors}</p>
            </div>
          </CardContent>
        </Card>
      </ScrollAnimate>
    </div>
  );
}
