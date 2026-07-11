// Shared between AccountCleanupService (hard-delete cron) and the account
// restore flow (AuthService.restoreAccountAndLogin) — both must agree on
// exactly how long a soft-deleted account remains restorable.
export const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 30;
