export type ReferrerCategory = "search" | "direct" | "social" | "other";

export const DIRECT_REFERRER_KEY = "(direct)";

const SEARCH_DOMAINS: readonly string[] = [
  "google.",
  "yandex.",
  "duckduckgo.com",
  "bing.com",
  "yahoo.com",
  "ecosia.org",
  "mail.ru",
  "search.brave.com",
  "startpage.com",
  "qwant.com",
  "baidu.com",
];

const SOCIAL_DOMAINS: readonly string[] = [
  "t.me",
  "telegram.org",
  "vk.com",
  "ok.ru",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "threads.net",
  "reddit.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "linkedin.com",
  "pinterest.com",
  "discord.com",
  "whatsapp.com",
];

export const categorizeReferrer = (
  host: string | null | undefined,
): ReferrerCategory => {
  if (!host || host === DIRECT_REFERRER_KEY) return "direct";
  const h = stripWww(host).toLowerCase();
  if (matches(h, SEARCH_DOMAINS)) return "search";
  if (matches(h, SOCIAL_DOMAINS)) return "social";
  return "other";
};

const stripWww = (host: string): string =>
  host.startsWith("www.") ? host.slice(4) : host;

const matches = (host: string, suffixes: readonly string[]): boolean => {
  for (const s of suffixes) {
    if (s.endsWith(".")) {
      if (host === s.slice(0, -1)) return true;
      if (host.startsWith(s)) return true;
      if (host.includes(`.${s}`)) return true;
    } else {
      if (host === s) return true;
      if (host.endsWith(`.${s}`)) return true;
    }
  }
  return false;
};
