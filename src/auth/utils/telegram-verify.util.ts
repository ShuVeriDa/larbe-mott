import { createHash, createHmac, timingSafeEqual } from "crypto";

const AUTH_MAX_AGE_SECONDS = 5 * 60; // защита от replay старых подписанных данных

export const verifyTelegramLogin = (
  data: Record<string, string | number>,
  botToken: string,
): boolean => {
  const { hash, ...fields } = data as { hash: string; [k: string]: string | number };

  // Свежесть — данные виджета не должны переиспользоваться спустя долгое время.
  const authDate = Number(fields.auth_date);
  if (!authDate || Date.now() / 1000 - authDate > AUTH_MAX_AGE_SECONDS) return false;

  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

  // Секретный ключ — SHA256 от bot token (так требует алгоритм Telegram, не сырой токен).
  const secretKey = createHash("sha256").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (!hash || typeof hash !== "string") return false;

  let hashBuffer: Buffer;
  let computedBuffer: Buffer;
  try {
    hashBuffer = Buffer.from(hash, "hex");
    computedBuffer = Buffer.from(computedHash, "hex");
  } catch {
    return false;
  }

  return (
    hashBuffer.length === computedBuffer.length &&
    hashBuffer.length > 0 &&
    timingSafeEqual(hashBuffer, computedBuffer)
  );
};
