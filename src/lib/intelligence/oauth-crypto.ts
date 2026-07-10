import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type EncryptedCredential = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function encryptionKey() {
  const secret = process.env.INTELLIGENCE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "INTELLIGENCE_TOKEN_ENCRYPTION_KEY must be configured with at least 32 characters.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptCredential(value: Record<string, unknown>): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredential<T extends Record<string, unknown>>(
  credential: EncryptedCredential,
): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(credential.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(credential.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(credential.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
