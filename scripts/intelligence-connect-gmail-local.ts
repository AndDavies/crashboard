import { config as loadEnvironment } from "dotenv";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

loadEnvironment({ path: ".env.local", quiet: true });

import {
  loadLocalIntelligenceKeychain,
  saveLocalIntelligenceKeychain,
} from "../src/lib/intelligence/agent-worker/local-keychain";
import {
  exchangeGmailAuthorizationCode,
  getGmailProfile,
  gmailAuthorizationUrl,
} from "../src/lib/intelligence/gmail";
import { encryptCredential } from "../src/lib/intelligence/oauth-crypto";
import { getTursoIntelligenceStore } from "../src/lib/intelligence/store";

loadLocalIntelligenceKeychain();
process.env.INTELLIGENCE_STORE = "turso";
process.env.GOOGLE_GMAIL_REDIRECT_URI = "http://localhost:3000/api/intelligence/google/callback";
delete process.env.OPENAI_API_KEY;
delete process.env.CODEX_API_KEY;

if (!process.env.INTELLIGENCE_TOKEN_ENCRYPTION_KEY?.trim()) {
  const secret = randomBytes(48).toString("base64url");
  process.env.INTELLIGENCE_TOKEN_ENCRYPTION_KEY = secret;
  saveLocalIntelligenceKeychain("INTELLIGENCE_TOKEN_ENCRYPTION_KEY", secret);
}

async function main() {
  const state = randomBytes(32).toString("hex");
  const store = getTursoIntelligenceStore();
  await store.initialize();

  const completion = new Promise<{ email: string }>((resolve, reject) => {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost:3000");
    if (url.pathname !== "/api/intelligence/google/callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    try {
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const oauthError = url.searchParams.get("error");
      if (oauthError) throw new Error(`Google authorization was not completed: ${oauthError}`);
      if (!code || returnedState !== state) throw new Error("Google returned an invalid OAuth state.");
      const tokens = await exchangeGmailAuthorizationCode(code);
      if (!tokens.refresh_token) throw new Error("Google did not return an offline refresh token.");
      const profile = await getGmailProfile(tokens.access_token);
      const ownerId = `google:${profile.emailAddress.toLocaleLowerCase()}`;
      await store.upsertSource({
        ownerId,
        sourceType: "gmail",
        externalKey: profile.emailAddress.toLocaleLowerCase(),
        name: `Gmail · ${profile.emailAddress}`,
        status: "active",
        config: { account_email: profile.emailAddress },
        credential: encryptCredential({
          refreshToken: tokens.refresh_token,
          email: profile.emailAddress,
          scope: tokens.scope,
        }),
        checkpoint: {},
      });
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        connection: "close",
      });
      response.end("<main style='font-family:system-ui;padding:40px'><h1>Gmail connected</h1><p>You can close this tab and return to Codex.</p></main>");
      resolve({ email: profile.emailAddress });
      server.close();
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "Gmail connection failed.");
      reject(error);
      server.close();
    }
  });
  server.on("error", reject);
  server.listen(3000, "127.0.0.1", () => {
    const url = gmailAuthorizationUrl(state, "m.andrew.davies@gmail.com");
    execFile("/usr/bin/open", [url], (error) => {
      if (error) reject(error);
    });
    process.stdout.write("Gmail authorization opened in the browser. Complete the Google consent screen to continue.\n");
  });
  setTimeout(() => {
    server.close();
    reject(new Error("Gmail authorization timed out after thirty minutes."));
  }, 30 * 60_000).unref();
  });

  const connected = await completion;
  process.stdout.write(`${JSON.stringify({ connected: true, email: connected.email, ownerId: `google:${connected.email.toLocaleLowerCase()}` }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
