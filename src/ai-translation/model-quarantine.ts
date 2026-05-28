const DEFAULT_QUARANTINE_TTL_MS = 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

interface QuarantineEntry {
  expiresAt: number;
}

// In-memory map: `${userId}:${model}` → expiry timestamp
const store = new Map<string, QuarantineEntry>();

const key = (userId: string, model: string) => `${userId}:${model}`;

const sweep = () => {
  const now = Date.now();
  for (const [k, entry] of store) {
    if (now > entry.expiresAt) store.delete(k);
  }
};

setInterval(sweep, SWEEP_INTERVAL_MS).unref();

export const quarantine = {
  set(userId: string, model: string, ttlMs = DEFAULT_QUARANTINE_TTL_MS): void {
    store.set(key(userId, model), { expiresAt: Date.now() + ttlMs });
  },

  isActive(userId: string, model: string): boolean {
    const entry = store.get(key(userId, model));
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      store.delete(key(userId, model));
      return false;
    }
    return true;
  },
};
