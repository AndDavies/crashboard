import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Shown when WHOOP is connected; metrics stay placeholder until API work. */
export function WhoopNextSteps() {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-base">What&apos;s next</CardTitle>
        <CardDescription>
          WHOOP data isn&apos;t fetched yet. When it is, these sections will
          populate from your connection.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-4">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/dashboard/whoop/recovery" />}
        >
          Recovery
        </Button>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/dashboard/whoop/sleep" />}
        >
          Sleep
        </Button>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/dashboard/whoop/strain" />}
        >
          Strain
        </Button>
      </CardContent>
    </Card>
  );
}
