import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KnowledgebaseDocumentDetailView } from "@/components/dashboard/knowledgebase/knowledgebase-document-detail";
import { Button } from "@/components/ui/button";
import { getKnowledgebaseDocument } from "@/lib/knowledgebase/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentId: string }>;
}): Promise<Metadata> {
  const { documentId } = await params;
  const document = await getKnowledgebaseDocument(documentId);
  if (!document) {
    return { title: "Knowledgebase document" };
  }
  return {
    title: document.title ?? "Knowledgebase document",
    description: document.summaryShort ?? "Repository document detail",
  };
}

export default async function KnowledgebaseDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const document = await getKnowledgebaseDocument(documentId);
  if (!document) notFound();

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/knowledgebase" />}>
        Back to Knowledgebase
      </Button>
      <KnowledgebaseDocumentDetailView document={document} />
    </div>
  );
}
