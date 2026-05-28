export type FallbackReason = "rate_limit" | "billing" | "unavailable";

export interface GeminiErrorInfo {
  status: number;
  retryAfterMs: number;
  fallbackReason: FallbackReason;
}

// Patterns that indicate a billing / no-paid-plan issue
const BILLING_PATTERNS = [
  "billing",
  "BILLING_DISABLED",
  "billing not enabled",
  "payment",
  "does not have an active",
  "upgrade your plan",
];

export const parseGeminiError = (
  httpStatus: number,
  body: string,
  retryAfterHeader: string | null,
): GeminiErrorInfo => {
  const parsed = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
  const retryAfterMs = Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 60_000;

  if (httpStatus === 429) {
    const isBilling = BILLING_PATTERNS.some((p) =>
      body.toLowerCase().includes(p.toLowerCase()),
    );
    return {
      status: httpStatus,
      retryAfterMs,
      fallbackReason: isBilling ? "billing" : "rate_limit",
    };
  }

  return { status: httpStatus, retryAfterMs, fallbackReason: "unavailable" };
};
