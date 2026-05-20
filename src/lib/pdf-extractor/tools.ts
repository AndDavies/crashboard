import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtractionDiagnostic } from "@/lib/pdf-extractor/types";

const execFileAsync = promisify(execFile);

type ToolResult = {
  stdout: string;
  stderr: string;
};

type ToolError = Error & {
  code?: number | string;
  stdout?: string;
  stderr?: string;
};

export async function toolAvailable(command: string) {
  try {
    await execFileAsync("which", [command], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function runTool(
  command: string,
  args: string[],
  options: { timeoutMs?: number; maxBuffer?: number } = {},
): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs ?? 120000,
      maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error) {
    const toolError = error as ToolError;
    const detail = [toolError.stderr, toolError.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    const code = toolError.code ? ` with exit code ${toolError.code}` : "";
    throw new Error(detail || `${command} failed${code}.`);
  }
}

export type ParsedPdfInfo = {
  pageCount: number;
  title?: string;
  encrypted?: boolean;
};

export function parsePdfInfoOutput(output: string): ParsedPdfInfo {
  const pagesMatch = output.match(/^Pages:\s+(\d+)/imu);
  const titleMatch = output.match(/^Title:\s+(.+)$/imu);
  const encryptedMatch = output.match(/^Encrypted:\s+(.+)$/imu);
  return {
    pageCount: pagesMatch ? Number(pagesMatch[1]) : 0,
    title: titleMatch?.[1]?.trim() || undefined,
    encrypted: encryptedMatch
      ? /^yes\b/iu.test(encryptedMatch[1]?.trim() ?? "")
      : undefined,
  };
}

export function passwordArgs(password?: string) {
  const value = password?.trim();
  return value ? ["-opw", value, "-upw", value] : [];
}

export function classifyPdfToolError(message: string): ExtractionDiagnostic {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("incorrect password") ||
    normalized.includes("invalid password")
  ) {
    return {
      level: "error",
      code: "password_invalid",
      message: "The supplied PDF password was rejected.",
      detail: message,
    };
  }

  if (
    normalized.includes("encrypted") ||
    normalized.includes("password") ||
    normalized.includes("permission")
  ) {
    return {
      level: "error",
      code: "password_required",
      message: "The PDF appears to be encrypted or password protected.",
      detail: message,
    };
  }

  if (normalized.includes("couldn't open file") || normalized.includes("no such file")) {
    return {
      level: "error",
      code: "file_not_found",
      message: "The PDF file could not be opened.",
      detail: message,
    };
  }

  return {
    level: "error",
    code: "pdf_tool_failed",
    message: "PDF tooling failed to process the file.",
    detail: message,
  };
}
