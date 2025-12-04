import { Users, AlertTriangle, Heart, Target, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PainPoint {
  pain_point?: string;
  issue?: string;
  theme?: string;
  evidence?: string;
  frequency?: string | number;
  solution?: string;
}

interface CustomerInsights {
  buyer_profile?: string;
  primary_pain_points?: PainPoint[];
  unmet_needs?: string[];
  love_most?: string[];
  decision_drivers?: string[];
}

interface CustomerIntelligenceProps {
  customerInsights: CustomerInsights | null;
  isLoading?: boolean;
}

export default function CustomerIntelligence({
  customerInsights,
  isLoading = false,
}: CustomerIntelligenceProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!customerInsights) {
    return null;
  }

  const { buyer_profile, primary_pain_points, unmet_needs, love_most, decision_drivers } = customerInsights;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <CardTitle>Customer Intelligence</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Target Buyer Profile */}
        {buyer_profile && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Target Buyer Profile</h3>
            <p className="text-muted-foreground">{buyer_profile}</p>
          </div>
        )}

        {/* Primary Pain Points Table */}
        {primary_pain_points && primary_pain_points.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Primary Pain Points
            </h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Pain Point</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead className="w-[120px]">Frequency</TableHead>
                    {primary_pain_points.some(p => p.solution) && (
                      <TableHead>Solution</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {primary_pain_points.map((point, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {point.pain_point || point.issue || point.theme || "Unknown"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {point.evidence || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {point.frequency || "N/A"}
                        </Badge>
                      </TableCell>
                      {primary_pain_points.some(p => p.solution) && (
                        <TableCell className="text-sm">{point.solution || "—"}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* Unmet Needs */}
          {unmet_needs && unmet_needs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-blue-500" />
                Unmet Needs
              </h3>
              <ul className="space-y-2">
                {unmet_needs.map((need, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-1">•</span>
                    <span>{need}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What Customers Love */}
          {love_most && love_most.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500" />
                What Customers Love
              </h3>
              <ul className="space-y-2">
                {love_most.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-rose-500 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Decision Drivers */}
        {decision_drivers && decision_drivers.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              Decision Drivers
            </h3>
            <p className="text-sm text-muted-foreground">
              Top purchase drivers:{" "}
              <span className="text-primary font-medium">
                {decision_drivers.join(", ")}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
