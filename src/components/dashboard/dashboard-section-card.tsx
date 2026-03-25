import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type DashboardSectionCardItem = {
  title: string;
  description: string;
  href: string;
};

export function DashboardSectionCard({
  title,
  description,
  icon: Icon,
  badge,
  items,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  items: DashboardSectionCardItem[];
}) {
  return (
    <Card className="h-full shadow-none">
      <CardHeader className="border-b border-border/60 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <CardTitle className="text-base">{title}</CardTitle>
            </div>
            <CardDescription className="max-w-2xl text-sm leading-relaxed">
              {description}
            </CardDescription>
          </div>
          {badge ? (
            <Badge variant="outline" className="shrink-0 font-normal">
              {badge}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {items.map((item) => (
          <Link
            key={item.href + item.title}
            href={item.href}
            className="block rounded-lg border border-border/70 bg-background px-4 py-3 transition-colors hover:bg-muted/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
