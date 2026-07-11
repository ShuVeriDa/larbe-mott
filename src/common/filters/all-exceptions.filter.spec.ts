import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AllExceptionsFilter } from "./all-exceptions.filter";

describe("AllExceptionsFilter", () => {
  const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
  const observability = { recordRequest: jest.fn() };
  let filter: AllExceptionsFilter;

  const buildHost = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const req = { method: "POST", url: "/api/auth/login", correlationId: "corr-1", requestStartMs: Date.now() };
    const host = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    };
    return { host: host as never, status, json };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter(logger as never, observability as never);
  });

  it("forwards extra structured fields beyond code/message (e.g. restoreEligible, deletedAt)", () => {
    const { host, status, json } = buildHost();
    const deletedAt = new Date("2026-06-01T00:00:00.000Z");

    filter.catch(
      new ForbiddenException({
        code: "ACCOUNT_SCHEDULED_FOR_DELETION",
        message: "Account scheduled for deletion.",
        deletedAt,
        restoreEligible: true,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ACCOUNT_SCHEDULED_FOR_DELETION",
        message: "Account scheduled for deletion.",
        deletedAt,
        restoreEligible: true,
      }),
    );
  });

  it("does not let extra fields overwrite the reserved statusCode/code/message keys", () => {
    const { host, json } = buildHost();

    filter.catch(
      new BadRequestException({
        code: "SOME_CODE",
        message: "Some message",
        statusCode: 999, // attacker-controlled-looking field name — must be ignored
      }),
      host,
    );

    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe("SOME_CODE");
  });

  it("still returns the plain code/message shape for exceptions with no extra fields", () => {
    const { host, json } = buildHost();

    filter.catch(new BadRequestException({ code: "USERNAME_TAKEN", message: "Taken" }), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "USERNAME_TAKEN", message: "Taken", statusCode: 400 }),
    );
  });

  it("falls back to a generic INTERNAL_SERVER_ERROR code for non-HttpException errors, without leaking the message", () => {
    const { host, json } = buildHost();

    filter.catch(new Error("some internal detail"), host);

    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
