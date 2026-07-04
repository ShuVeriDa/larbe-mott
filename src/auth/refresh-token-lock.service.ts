import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { RedisService } from "src/redis/redis.service";

// Per-user mutex guarding any read-then-write of User.hashedRefreshToken.
// Both token rotation (AuthService.getNewTokens) and every place that revokes
// a session by clearing the hash (logout, password/email change, admin
// force-logout, account soft-delete) must serialize against each other —
// otherwise an in-flight rotation can finish just after a revocation and
// silently re-set a valid hash, "un-revoking" the session.
@Injectable()
export class RefreshTokenLockService {
  constructor(private readonly redis: RedisService) {}

  async withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `auth:refresh-lock:${userId}`;
    const lockValue = randomBytes(16).toString("hex");
    const lockTtlMs = 5000;
    const pollIntervalMs = 50;
    const maxWaitMs = 3000;

    let acquired = false;
    try {
      // Bound the ENTIRE acquire attempt by maxWaitMs, not each individual
      // SET call. If Redis is genuinely slow/unreachable, we give up and run
      // unlocked (matching pre-lock behavior) rather than firing overlapping
      // SET NX attempts with the same lockValue — see acquireLockWithWait for
      // why that would create its own phantom-lock hazard.
      acquired = await Promise.race([
        this.acquireLockWithWait(lockKey, lockValue, lockTtlMs, pollIntervalMs, maxWaitMs),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), maxWaitMs)),
      ]);
    } catch {
      // Redis unreachable/erroring — degrade gracefully rather than hard-fail
      // auth requests that never depended on Redis before this lock existed.
      acquired = false;
    }

    if (!acquired) {
      return fn();
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  private async acquireLockWithWait(
    key: string,
    value: string,
    ttlMs: number,
    pollIntervalMs: number,
    maxWaitMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      // Wait for the actual SET NX response — no per-iteration timeout race.
      // Racing a fresh SET against a timer on every loop tick would let a
      // "timed out" SET keep running in the background; if it later succeeds
      // with this same lockValue, subsequent retries in this same call would
      // fail their own NX check (key already set by our own abandoned call),
      // making acquireLockWithWait report failure while a phantom lock we
      // technically hold sits in Redis unreleased until its TTL — reopening
      // the exact race this lock exists to close. Let the outer maxWaitMs
      // budget bound the whole loop instead of each individual SET call.
      const set = await this.redis.set(key, value, "PX", ttlMs, "NX");
      if (set === "OK") return true;
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  private async releaseLock(key: string, value: string): Promise<void> {
    // Only release if we still own the lock (value matches) — avoids releasing
    // a lock acquired by another request after ours expired.
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, key, value).catch(() => undefined);
  }
}
