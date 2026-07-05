import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type OAuthIntent = "login" | "link";

export interface OAuthState {
  nonce: string;
  lang: string;
  intent: OAuthIntent;
}

const sign = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export const createOAuthState = (
  lang: string,
  secret: string,
  intent: OAuthIntent = "login",
): string => {
  const nonce = randomBytes(16).toString("base64url");
  const payload = JSON.stringify({ nonce, lang, intent });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
};

export const verifyOAuthState = (token: string, secret: string): OAuthState | null => {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSignature = sign(payloadB64, secret);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (typeof payload.nonce !== "string" || typeof payload.lang !== "string") return null;
    const intent: OAuthIntent = payload.intent === "link" ? "link" : "login";
    return { nonce: payload.nonce, lang: payload.lang, intent };
  } catch {
    return null;
  }
};
