import { execFileSync } from "node:child_process";

const ACCOUNT = "crashboard-intelligence";

const LOCAL_CREDENTIALS = {
  TURSO_DATABASE_URL: "dev.crashboard.intelligence.turso-url",
  TURSO_AUTH_TOKEN: "dev.crashboard.intelligence.turso-token",
  INTELLIGENCE_TOKEN_ENCRYPTION_KEY: "dev.crashboard.intelligence.encryption-key",
  INTELLIGENCE_OWNER_ID: "dev.crashboard.intelligence.owner-id",
  GOOGLE_GMAIL_CLIENT_SECRET: "dev.crashboard.intelligence.gmail-client-secret",
} as const;

export function loadLocalIntelligenceKeychain() {
  if (process.platform !== "darwin") return;
  for (const [variable, service] of Object.entries(LOCAL_CREDENTIALS)) {
    const configured = process.env[variable]?.trim() ?? "";
    const validGoogleSecret = variable !== "GOOGLE_GMAIL_CLIENT_SECRET"
      || /^GOCSPX-[A-Za-z0-9_-]{20,}$/u.test(configured);
    if (configured && validGoogleSecret) continue;
    try {
      process.env[variable] = execFileSync("/usr/bin/security", [
        "find-generic-password",
        "-a",
        ACCOUNT,
        "-s",
        service,
        "-w",
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      // Callers validate the credentials they actually require.
    }
  }
}

export function saveLocalIntelligenceKeychain(service: keyof typeof LOCAL_CREDENTIALS, value: string) {
  if (process.platform !== "darwin") return;
  execFileSync("/usr/bin/security", [
    "add-generic-password",
    "-a",
    ACCOUNT,
    "-s",
    LOCAL_CREDENTIALS[service],
    "-w",
    value,
    "-U",
  ], { stdio: "ignore" });
}
