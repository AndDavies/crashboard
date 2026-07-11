import type { Metadata } from "next";
import { ArchiveReprocessControl } from "@/components/dashboard/intelligence/archive-reprocess-control";

export const metadata: Metadata = { title: "Archive Reprocessing · Trend Intelligence" };

export default function ArchiveReprocessingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-7 pb-14">
      <header className="border-b border-foreground/80 pb-6">
        <p className="editorial-kicker">Trend intelligence / maintenance</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold">Archive analytics rebuild</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Lightweight, resumable production control for rare full-archive materialization.
        </p>
      </header>
      <ArchiveReprocessControl />
    </div>
  );
}
