import type { Metadata } from "next";
import { PdfExtractorTool } from "@/components/dashboard/pdf-extractor/pdf-extractor-tool";

export const metadata: Metadata = { title: "PDF Extractor" };

export default function DashboardPdfExtractorPage() {
  return <PdfExtractorTool />;
}
