import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted/50 ${className}`} />;
}

export default function KnowledgebaseLoading() {
  return (
    <div className="space-y-8">
      <section className="space-y-3 border-b border-border/80 pb-6">
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="h-8 w-48" />
        <SkeletonBlock className="h-4 w-full max-w-3xl" />
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="shadow-none">
            <CardHeader>
              <SkeletonBlock className="h-3 w-24" />
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <SkeletonBlock className="h-7 w-20" />
              <SkeletonBlock className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-3 w-80" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,1fr))]">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-8 w-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-6 w-20" />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="shadow-none">
            <CardContent className="space-y-3 pt-4">
              <SkeletonBlock className="h-5 w-48" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
              <SkeletonBlock className="h-6 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
