import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonCard,
  SkeletonText,
  SkeletonAvatar,
  SkeletonChart,
  SkeletonKPICard,
  SkeletonListItem,
  SkeletonBadge,
  SkeletonImage,
} from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-10 pb-16">
      {/* Hero Header Skeleton */}
      <SkeletonCard className="p-6 md:p-8 animate-fade-in">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-48" />
              <SkeletonBadge />
            </div>
            <SkeletonText lines={2} lastLineWidth="w-3/4" />
            <div className="flex gap-2 mt-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-10 w-10 rounded-full"
                  delay={i * 100}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-28 w-28 rounded-full" />
            <Skeleton className="h-4 w-20" delay={100} />
          </div>
        </div>
      </SkeletonCard>

      {/* KPI Metrics Grid Skeleton */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        style={{ animationDelay: "100ms" }}
      >
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="animate-fade-in"
            style={{ animationDelay: `${150 + i * 100}ms` }}
          >
            <SkeletonKPICard />
          </div>
        ))}
      </div>

      {/* Benchmark Comparison Skeleton */}
      <SkeletonCard
        className="p-0 animate-fade-in"
        style={{ animationDelay: "250ms" }}
      >
        <CardHeader className="p-7">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" delay={50} />
        </CardHeader>
        <CardContent className="p-7 pt-0">
          <div className="flex gap-4 overflow-hidden">
            {/* Our Concept Skeleton */}
            <div className="w-[280px] md:w-[320px] shrink-0 rounded-xl border border-dashed border-primary/30 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-6 w-24" />
              </div>
              <SkeletonImage aspectRatio="square" className="h-32" />
              <SkeletonText lines={2} />
              <div className="flex gap-2">
                <SkeletonBadge />
                <SkeletonBadge />
              </div>
              <Skeleton className="h-20 w-full rounded-lg" delay={200} />
            </div>
            {/* Product Cards Skeleton */}
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-[280px] md:w-[320px] shrink-0 rounded-xl border border-border/50 p-4 space-y-4"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <SkeletonImage aspectRatio="square" className="h-32" />
                <SkeletonText lines={2} />
                <div className="flex gap-2">
                  <Skeleton className="h-8 flex-1 rounded-lg" delay={100} />
                  <Skeleton className="h-8 flex-1 rounded-lg" delay={150} />
                </div>
                <Skeleton className="h-20 w-full rounded-lg" delay={200} />
                <Skeleton className="h-16 w-full rounded-lg" delay={250} />
              </div>
            ))}
          </div>
        </CardContent>
      </SkeletonCard>

      {/* Deep Dive & Brand Market Share Row */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in"
        style={{ animationDelay: "350ms" }}
      >
        {/* 18-Point Analysis Skeleton */}
        <SkeletonCard className="p-0">
          <CardHeader className="p-7">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-64 mt-2" delay={50} />
          </CardHeader>
          <CardContent className="p-7 pt-0">
            <div className="flex items-center justify-center h-[280px]">
              <div className="relative">
                <Skeleton className="w-56 h-56 rounded-full" />
                <Skeleton className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full" />
              </div>
            </div>
            <div className="pt-6 border-t mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-36" />
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-6 w-12 rounded-md" delay={i * 50} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" delay={i * 100} />
                ))}
              </div>
            </div>
          </CardContent>
        </SkeletonCard>

        {/* Brand Market Share Skeleton */}
        <SkeletonCard className="p-0">
          <CardHeader className="p-7">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56 mt-2" delay={50} />
          </CardHeader>
          <CardContent className="p-7 pt-0">
            <div className="flex flex-col items-center gap-6">
              <Skeleton className="h-[200px] w-[200px] rounded-full" />
              <div className="grid grid-cols-2 gap-3 w-full">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-3 bg-secondary/30 rounded-xl"
                  >
                    <Skeleton className="w-3 h-3 rounded-full shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-16 mb-1" delay={i * 50} />
                      <Skeleton className="h-4 w-10" delay={i * 50 + 25} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </SkeletonCard>
      </div>

      {/* Customer Intelligence Skeleton */}
      <SkeletonCard
        className="p-0 animate-fade-in"
        style={{ animationDelay: "450ms" }}
      >
        <CardHeader className="p-7">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-72 mt-2" delay={50} />
        </CardHeader>
        <CardContent className="p-7 pt-0 space-y-6">
          {/* Buyer profile */}
          <div className="flex items-start gap-4 p-4 bg-secondary/30 rounded-xl">
            <SkeletonAvatar size="lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <SkeletonText lines={2} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Skeleton className="h-5 w-28" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-4 flex-1" delay={i * 50} />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <Skeleton className="h-5 w-28" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-4 flex-1" delay={i * 50} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </SkeletonCard>

      {/* Financial Projections Skeleton */}
      <SkeletonCard
        className="p-0 animate-fade-in"
        style={{ animationDelay: "550ms" }}
      >
        <CardHeader className="p-7">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-56 mt-2" delay={50} />
        </CardHeader>
        <CardContent className="p-7 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Skeleton className="h-5 w-32" />
              <SkeletonChart type="bar" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-5 w-32" />
              <SkeletonChart type="line" />
            </div>
          </div>
        </CardContent>
      </SkeletonCard>

      {/* Launch Plan Skeleton */}
      <SkeletonCard
        className="p-0 animate-fade-in"
        style={{ animationDelay: "650ms" }}
      >
        <CardHeader className="p-7">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" delay={50} />
        </CardHeader>
        <CardContent className="p-7 pt-0 space-y-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonListItem key={i} />
          ))}
        </CardContent>
      </SkeletonCard>

      {/* Risk Analysis Skeleton */}
      <SkeletonCard
        className="p-0 animate-fade-in"
        style={{ animationDelay: "750ms" }}
      >
        <CardHeader className="p-7">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" delay={50} />
        </CardHeader>
        <CardContent className="p-7 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 bg-secondary/30 rounded-xl"
              >
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" delay={i * 50} />
                  <Skeleton className="h-3 w-full" delay={i * 50 + 25} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </SkeletonCard>
    </div>
  );
}

// Compact skeleton for inline loading
export function DashboardSectionSkeleton({ title }: { title?: string }) {
  return (
    <SkeletonCard className="p-0 animate-fade-in">
      <CardHeader className="p-7">
        {title ? (
          <h3 className="text-lg font-semibold">{title}</h3>
        ) : (
          <Skeleton className="h-6 w-40" />
        )}
        <Skeleton className="h-4 w-56 mt-2" />
      </CardHeader>
      <CardContent className="p-7 pt-0">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <SkeletonText lines={2} />
        </div>
      </CardContent>
    </SkeletonCard>
  );
}

// Mini skeleton for small loading areas
export function MiniSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-fade-in">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}
