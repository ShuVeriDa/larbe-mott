import * as geoip from "geoip-lite";

export type SessionLocation = {
  country: string | null;
  city: string | null;
};

export function lookupSessionLocation(ip?: string | null): SessionLocation | null {
  if (!ip) return null;
  const cleaned = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (
    cleaned === "::1" ||
    cleaned === "127.0.0.1" ||
    cleaned.startsWith("10.") ||
    cleaned.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(cleaned)
  ) {
    return null;
  }
  try {
    const lookup = geoip.lookup(cleaned);
    if (!lookup) return null;
    return {
      country: lookup.country || null,
      city: lookup.city || null,
    };
  } catch {
    return null;
  }
}

export function parseDeviceLabel(ua?: string | null): string | null {
  if (!ua) return null;

  const browser = (() => {
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\/|Opera/.test(ua)) return "Opera";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
    if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
    return "Browser";
  })();

  const os = (() => {
    if (/Windows NT 10\.0/.test(ua)) return "Windows 10/11";
    if (/Windows NT 6\.[1-3]/.test(ua)) return "Windows 7/8";
    if (/Mac OS X/.test(ua) && /iPhone|iPad/.test(ua) === false) return "macOS";
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua)) return "iPad";
    if (/Android/.test(ua)) return "Android";
    if (/Linux/.test(ua)) return "Linux";
    return "Unknown";
  })();

  return `${browser} · ${os}`;
}
