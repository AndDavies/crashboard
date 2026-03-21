import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type OpenClawStat = {
  label: string;
  value: string | number;
  hint?: string;
};

export function OpenClawStatCard({ label, value, hint }: OpenClawStat) {
  return (
    <Card size="sm" className="shadow-none">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
