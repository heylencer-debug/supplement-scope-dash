import { Users, AlertTriangle, Heart, Target, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle>Customer Intelligence</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Target Buyer Profile Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          
          {/* Pain Points Table Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-36" />
            <div className="rounded-md border">
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                </div>
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            </div>
          </div>

          {/* Unmet Needs & What Customers Love Skeleton */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <Skeleton className="h-5 w-28" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-5 w-36" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
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
      <CardContent className="space-y-8 animate-fade-in">
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
              <AlertTriangle className="w-4 h-4 text-chart-2" />
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
                <Lightbulb className="w-4 h-4 text-chart-3" />
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
                <Heart className="w-4 h-4 text-destructive" />
                What Customers Love
              </h3>
              <ul className="space-y-2">
                {love_most.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-destructive mt-1">•</span>
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
              <Target className="w-4 h-4 text-chart-4" />
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
