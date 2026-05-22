import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

const getKey = (): Buffer => {
  const raw = process.env.GEMINI_KEY_ENCRYPTION_SECRET ?? "";
  if (!raw) {
    throw new Error("GEMINI_KEY_ENCRYPTION_SECRET env var is not set");
  }
  // Derive a 32-byte key: pad/slice the secret
  return Buffer.from(raw.padEnd(32, "0").slice(0, 32), "utf8");
};

export const encryptApiKey = (plaintext: string): string => {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv(12):authTag(16):ciphertext — all hex
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decryptApiKey = (stored: string): string => {
  const key = getKey();
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted key format");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
};
