import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthProvider } from "@prisma/client";
import { hash } from "argon2";
import { createHash, createHmac } from "crypto";
import { ErrorCode } from "src/common/errors/error-codes";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    userSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    userEvent: {
      create: jest.fn(),
    },
    passwordResetToken: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue("signed-token") };
  const userService = {};
  const configService = {
    get: jest.fn(),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === "ACCESS_TOKEN_EXPIRES_IN") return "1h";
      if (key === "REFRESH_TOKEN_EXPIRES_IN") return "7d";
      return "mock-secret";
    }),
  };
  const redis = { set: jest.fn(), del: jest.fn() };
  const mail = { sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined) };
  const refreshLock = { withLock: jest.fn().mockImplementation((_userId: string, fn: () => unknown) => fn()) };
  const imageProcessing = { processAvatar: jest.fn() };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as never,
      jwt as never,
      userService as never,
      configService as never,
      redis as never,
      mail as never,
      refreshLock as never,
      imageProcessing as never,
    );
  });

  describe("validateUser (OAuth-only account)", () => {
    it("throws PASSWORD_NOT_SET instead of crashing on null password", async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        username: "oauthuser",
        email: "oauth@example.com",
        password: null,
        status: "ACTIVE",
      });

      await expect(
        (service as unknown as { validateUser: (dto: unknown) => Promise<unknown> }).validateUser({
          username: "oauthuser",
          password: "whatever",
        }),
      ).rejects.toMatchObject({
        constructor: UnauthorizedException,
        response: { code: ErrorCode.PASSWORD_NOT_SET },
      });
    });
  });

  describe("changePassword (OAuth-only account)", () => {
    it("throws PASSWORD_NOT_SET instead of crashing on null password", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "oauth@example.com",
        password: null,
        status: "ACTIVE",
      });

      await expect(
        service.changePassword("u1", "currentPass", "newPass"),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: ErrorCode.PASSWORD_NOT_SET },
      });
    });
  });

  describe("requestEmailChange (OAuth-only account)", () => {
    it("throws PASSWORD_NOT_SET instead of crashing on null password", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "oauth@example.com",
        password: null,
        status: "ACTIVE",
      });

      await expect(
        service.requestEmailChange("u1", "new@example.com", "currentPass", "ru"),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: ErrorCode.PASSWORD_NOT_SET },
      });
    });
  });

  describe("loginWithOAuthProfile", () => {
    const googleProfile = {
      providerAccountId: "google-123",
      email: "user@example.com",
      emailVerified: true,
      firstName: "Ali",
      lastName: "Test",
      avatarUrl: undefined,
    };

    beforeEach(() => {
      prisma.userSession.create.mockResolvedValue({ id: "session-1", createdAt: new Date() });
      prisma.userEvent.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
    });

    it("logs in via an existing linked Account without creating a new user", async () => {
      prisma.account.findUnique.mockResolvedValue({
        userId: "u1",
        user: { id: "u1", status: "ACTIVE", password: null, hashedRefreshToken: null },
      });

      const result = await service.loginWithOAuthProfile(AuthProvider.GOOGLE, googleProfile);

      expect(prisma.account.findUnique).toHaveBeenCalledWith({
        where: { provider_providerAccountId: { provider: AuthProvider.GOOGLE, providerAccountId: "google-123" } },
        include: { user: true },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.account.create).not.toHaveBeenCalled();
      expect(result.rememberMe).toBe(true);
      expect(result.user).toMatchObject({ id: "u1" });
    });

    it("auto-links to an existing verified-email user without creating a duplicate", async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({
        id: "u2",
        email: "user@example.com",
        status: "ACTIVE",
        password: "existing-hash",
        hashedRefreshToken: null,
      });
      prisma.account.create.mockResolvedValue({});

      const result = await service.loginWithOAuthProfile(AuthProvider.GOOGLE, googleProfile);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          userId: "u2",
          provider: AuthProvider.GOOGLE,
          providerAccountId: "google-123",
          email: "user@example.com",
        },
      });
      expect(result.user).toMatchObject({ id: "u2" });
    });

    it("does not auto-link when the email is not verified by the provider", async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null); // only hit by generateUniqueUsername below
      prisma.user.create.mockResolvedValue({
        id: "u3",
        status: "ACTIVE",
        password: null,
        hashedRefreshToken: null,
      });

      const unverifiedProfile = { ...googleProfile, emailVerified: false };
      await service.loginWithOAuthProfile(AuthProvider.GOOGLE, unverifiedProfile);

      // Should never look up an existing user BY EMAIL when unverified — the only
      // findFirst calls allowed are generateUniqueUsername's availability checks.
      const emailLookupCalls = prisma.user.findFirst.mock.calls.filter(
        ([args]) => args?.where?.email !== undefined,
      );
      expect(emailLookupCalls).toHaveLength(0);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it("creates a new user when no Account or verified-email match exists", async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.user.findFirst
        .mockResolvedValueOnce(null) // existingByEmail check
        .mockResolvedValueOnce(null); // generateUniqueUsername availability check
      prisma.user.create.mockResolvedValue({
        id: "u4",
        status: "ACTIVE",
        password: null,
        hashedRefreshToken: null,
      });

      const result = await service.loginWithOAuthProfile(AuthProvider.GOOGLE, googleProfile);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "user@example.com",
            password: null,
            accounts: {
              create: { provider: AuthProvider.GOOGLE, providerAccountId: "google-123", email: "user@example.com" },
            },
          }),
        }),
      );
      expect(result.user).toMatchObject({ id: "u4" });
      expect(result.rememberMe).toBe(true);
    });
  });

  describe("confirmPasswordReset (OAuth-only account setting a first password)", () => {
    it("succeeds for a user whose password is currently null", async () => {
      const rawToken = "a".repeat(32);
      const tokenHash = await hash(rawToken);

      prisma.passwordResetToken.findMany.mockResolvedValue([
        {
          id: "reset-1",
          userId: "u5",
          tokenHash,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: { id: "u5", email: "oauth@example.com", status: "ACTIVE" },
        },
      ]);
      prisma.user.update.mockResolvedValue({ id: "u5", password: null });

      await service.confirmPasswordReset(rawToken, "NewPassw0rd!");

      // The update call in the $transaction batch must set a real password hash —
      // this must succeed identically whether the prior password was null or set.
      const updateCall = prisma.user.update.mock.calls[0]?.[0];
      expect(updateCall.where).toEqual({ id: "u5" });
      expect(typeof updateCall.data.password).toBe("string");
      expect(updateCall.data.password).not.toBeNull();
      expect(updateCall.data.hashedRefreshToken).toBeNull();
    });
  });

  describe("unlinkAccount", () => {
    it("blocks unlinking the only sign-in method (no password, single Account)", async () => {
      prisma.user.findUnique.mockResolvedValue({ password: null });
      prisma.account.count.mockResolvedValue(1);

      await expect(service.unlinkAccount("u1", "acc-1")).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: ErrorCode.LAST_LOGIN_METHOD },
      });
      expect(prisma.account.delete).not.toHaveBeenCalled();
    });

    it("allows unlinking when the user has a password set", async () => {
      prisma.user.findUnique.mockResolvedValue({ password: "some-hash" });
      prisma.account.count.mockResolvedValue(1);
      prisma.account.findFirst.mockResolvedValue({ id: "acc-1", userId: "u1" });
      prisma.account.delete.mockResolvedValue({});

      const result = await service.unlinkAccount("u1", "acc-1");

      expect(prisma.account.delete).toHaveBeenCalledWith({ where: { id: "acc-1" } });
      expect(result).toEqual({ ok: true });
    });

    it("allows unlinking one of two Accounts even without a password", async () => {
      prisma.user.findUnique.mockResolvedValue({ password: null });
      prisma.account.count.mockResolvedValue(2);
      prisma.account.findFirst.mockResolvedValue({ id: "acc-1", userId: "u1" });
      prisma.account.delete.mockResolvedValue({});

      await service.unlinkAccount("u1", "acc-1");

      expect(prisma.account.delete).toHaveBeenCalledWith({ where: { id: "acc-1" } });
    });
  });

  describe("linkGoogleAccount", () => {
    const profile = {
      providerAccountId: "google-999",
      email: "linked@example.com",
      emailVerified: true,
      firstName: "Ali",
      lastName: "Test",
      avatarUrl: undefined,
    };

    it("links a new Google account to the current user", async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue({});

      const result = await service.linkGoogleAccount("u1", profile);

      expect(prisma.account.create).toHaveBeenCalledWith({
        data: { userId: "u1", provider: AuthProvider.GOOGLE, providerAccountId: "google-999", email: "linked@example.com" },
      });
      expect(result).toEqual({ ok: true });
    });

    it("is idempotent when the account is already linked to the same user", async () => {
      prisma.account.findUnique.mockResolvedValue({ userId: "u1" });

      const result = await service.linkGoogleAccount("u1", profile);

      expect(prisma.account.create).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it("rejects linking a Google account already linked to ANOTHER user", async () => {
      prisma.account.findUnique.mockResolvedValue({ userId: "someone-else" });

      await expect(service.linkGoogleAccount("u1", profile)).rejects.toMatchObject({
        response: { code: ErrorCode.ACCOUNT_ALREADY_LINKED },
      });
      expect(prisma.account.create).not.toHaveBeenCalled();
    });
  });

  describe("loginWithTelegram / linkTelegramAccount", () => {
    // configService.getOrThrow mock returns "mock-secret" for TELEGRAM_BOT_TOKEN.
    const botToken = "mock-secret";

    const signTelegramFields = (fields: Record<string, string | number>) => {
      const checkString = Object.keys(fields)
        .sort()
        .map((key) => `${key}=${fields[key]}`)
        .join("\n");
      const secretKey = createHash("sha256").update(botToken).digest();
      return createHmac("sha256", secretKey).update(checkString).digest("hex");
    };

    const validTelegramDto = () => {
      const fields = {
        id: 555,
        first_name: "Ali",
        username: "ali_tg",
        auth_date: Math.floor(Date.now() / 1000),
      };
      return { ...fields, hash: signTelegramFields(fields) };
    };

    beforeEach(() => {
      prisma.userSession.create.mockResolvedValue({ id: "session-1", createdAt: new Date() });
      prisma.userEvent.create.mockResolvedValue({});
    });

    it("rejects a login attempt with an invalid signature", async () => {
      const dto = { ...validTelegramDto(), hash: "0".repeat(64) };

      await expect(service.loginWithTelegram(dto)).rejects.toMatchObject({
        constructor: UnauthorizedException,
        response: { code: ErrorCode.TELEGRAM_SIGNATURE_INVALID },
      });
    });

    it("creates a new user with a placeholder email when the signature is valid", async () => {
      const dto = validTelegramDto();
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null); // generateUniqueUsername availability check
      prisma.user.create.mockResolvedValue({
        id: "u-tg-1",
        status: "ACTIVE",
        password: null,
        hashedRefreshToken: null,
      });

      await service.loginWithTelegram(dto);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "telegram-555@users.mottlarbe.internal",
            password: null,
            accounts: {
              create: { provider: AuthProvider.TELEGRAM, providerAccountId: "555", email: "telegram-555@users.mottlarbe.internal" },
            },
          }),
        }),
      );
    });

    it("linkTelegramAccount rejects an invalid signature", async () => {
      const dto = { ...validTelegramDto(), hash: "0".repeat(64) };

      await expect(service.linkTelegramAccount("u1", dto)).rejects.toMatchObject({
        constructor: UnauthorizedException,
        response: { code: ErrorCode.TELEGRAM_SIGNATURE_INVALID },
      });
    });

    it("linkTelegramAccount links a new Telegram account to the current user", async () => {
      const dto = validTelegramDto();
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue({});

      const result = await service.linkTelegramAccount("u1", dto);

      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          provider: AuthProvider.TELEGRAM,
          providerAccountId: "555",
          email: "telegram-555@users.mottlarbe.internal",
        },
      });
      expect(result).toEqual({ ok: true });
    });

    it("linkTelegramAccount rejects linking a Telegram account already linked to ANOTHER user", async () => {
      const dto = validTelegramDto();
      prisma.account.findUnique.mockResolvedValue({ userId: "someone-else" });

      await expect(service.linkTelegramAccount("u1", dto)).rejects.toMatchObject({
        constructor: ConflictException,
        response: { code: ErrorCode.ACCOUNT_ALREADY_LINKED },
      });
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it("linkTelegramAccount is idempotent when already linked to the same user", async () => {
      const dto = validTelegramDto();
      prisma.account.findUnique.mockResolvedValue({ userId: "u1" });

      const result = await service.linkTelegramAccount("u1", dto);

      expect(prisma.account.create).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });
  });
});
