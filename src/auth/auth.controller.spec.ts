import { UnauthorizedException } from "@nestjs/common";
import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  const authService = {
    login: jest.fn(),
    register: jest.fn(),
    addRefreshTokenResponse: jest.fn(),
    recordSession: jest.fn(),
    removeRefreshTokenFromResponse: jest.fn(),
    getNewTokens: jest.fn(),
    logout: jest.fn(),
    getSessions: jest.fn(),
    revokeAllSessions: jest.fn(),
    revokeSession: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue("refresh_token"),
  };

  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(authService as never, configService as never);
  });

  it("should login and persist session metadata", async () => {
    authService.login.mockResolvedValue({
      user: { id: "u1" },
      accessToken: "access",
      refreshToken: "refresh",
    });
    const req = { ip: "127.0.0.1", headers: { "user-agent": "jest" } };
    const res = {};

    const result = await controller.login({} as never, req as never, res as never);

    expect(authService.login).toHaveBeenCalled();
    expect(authService.addRefreshTokenResponse).toHaveBeenCalledWith(res, "refresh");
    expect(authService.recordSession).toHaveBeenCalledWith("u1", "127.0.0.1", "jest");
    expect(result).toEqual({ user: { id: "u1" }, accessToken: "access" });
  });

  it("should reject refresh when cookie is missing", async () => {
    const req = { cookies: {} };
    const res = {};

    await expect(controller.getNewTokens(req as never, res as never)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(authService.removeRefreshTokenFromResponse).toHaveBeenCalledWith(res);
  });

  it("should revoke refresh cookie on logout", async () => {
    const res = {};
    await controller.logout("u1", res as never);

    expect(authService.logout).toHaveBeenCalledWith("u1");
    expect(authService.removeRefreshTokenFromResponse).toHaveBeenCalledWith(res);
  });
});
