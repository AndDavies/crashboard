import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractPdf, saveExtractionCompanion } from "@/lib/pdf-extractor";

const tempDirs: string[] = [];

function escapePdfText(text: string) {
  return text.replace(/\\/gu, "\\\\").replace(/\(/gu, "\\(").replace(/\)/gu, "\\)");
}

function createSimplePdf(text: string) {
  const content = `BT /F1 18 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;
  return createPdfFromContent(content);
}

function createPdfFromContent(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function createTwoColumnPdf() {
  return createPdfFromContent(
    [
      "BT /F1 12 Tf",
      `72 720 Td (${escapePdfText("Left column first sentence.")}) Tj`,
      `0 -20 Td (${escapePdfText("Left column second sentence.")}) Tj`,
      `260 20 Td (${escapePdfText("Right column first sentence.")}) Tj`,
      `0 -20 Td (${escapePdfText("Right column second sentence.")}) Tj`,
      "ET",
    ].join("\n"),
  );
}

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crashboard-pdf-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("pdf extractor", () => {
  it("extracts a generated PDF and saves a companion markdown file", async () => {
    const dir = await makeTempDir();
    const pdfPath = path.join(dir, "example.pdf");
    const markdownOutputDir = path.join(dir, "outputs", "pdf-extract");
    const assetOutputDir = path.join(dir, "assets", "pdf-extract");
    await fs.writeFile(pdfPath, createSimplePdf("Hello from a generated PDF."));

    const result = await extractPdf({
      source: { type: "path", path: pdfPath },
      aiMode: "off",
      markdownOutputDir,
      assetOutputDir,
      workDir: path.join(dir, "work"),
    });

    expect(result.status).toBe("succeeded");
    expect(result.markdown).toContain("Hello from a generated PDF");
    expect(result.visualAssets.some((asset) => asset.kind === "page-render")).toBe(
      true,
    );

    const saved = await saveExtractionCompanion(result, {
      vaultRoot: dir,
      markdownOutputDir,
      assetOutputDir,
    });
    await expect(fs.stat(saved.markdownPath)).resolves.toBeTruthy();
    expect(saved.assetCount).toBeGreaterThan(0);
  });

  it("classifies a zero-byte PDF as failed and not saveable", async () => {
    const dir = await makeTempDir();
    const pdfPath = path.join(dir, "empty.pdf");
    await fs.writeFile(pdfPath, "");

    const result = await extractPdf({
      source: { type: "path", path: pdfPath },
      aiMode: "off",
      workDir: path.join(dir, "work"),
    });

    expect(result.status).toBe("failed");
    expect(result.saveEligibility).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain("zero_byte_pdf");
  });

  it("extracts reflowed text instead of fixed layout columns", async () => {
    const dir = await makeTempDir();
    const pdfPath = path.join(dir, "columns.pdf");
    await fs.writeFile(pdfPath, createTwoColumnPdf());

    const result = await extractPdf({
      source: { type: "path", path: pdfPath },
      aiMode: "off",
      workDir: path.join(dir, "work"),
    });

    expect(result.status).toBe("succeeded");
    expect(result.plainText).toContain("Left column first sentence.");
    expect(result.plainText).not.toMatch(
      /Left column first sentence\.\s{5,}Right column first sentence\./u,
    );
  });
});
