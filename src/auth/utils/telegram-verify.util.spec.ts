import { createHash, createHmac } from "crypto";
import { verifyTelegramLogin } from "./telegram-verify.util";

describe("telegram-verify.util", () => {
  const botToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

  const signFields = (fields: Record<string, string | number>, token = botToken): string => {
    const checkString = Object.keys(fields)
      .sort()
      .map((key) => `${key}=${fields[key]}`)
      .join("\n");
    const secretKey = createHash("sha256").update(token).digest();
    return createHmac("sha256", secretKey).update(checkString).digest("hex");
  };

  const validFields = () => ({
    id: 12345,
    first_name: "Ali",
    username: "ali_test",
    auth_date: Math.floor(Date.now() / 1000),
  });

  it("accepts a correctly signed, fresh payload", () => {
    const fields = validFields();
    const hash = signFields(fields);

    expect(verifyTelegramLogin({ ...fields, hash }, botToken)).toBe(true);
  });

  it("rejects a payload signed with the wrong bot token", () => {
    const fields = validFields();
    const hash = signFields(fields, "wrong-bot-token");

    expect(verifyTelegramLogin({ ...fields, hash }, botToken)).toBe(false);
  });

  it("rejects a tampered field even if the hash format is valid", () => {
    const fields = validFields();
    const hash = signFields(fields);

    expect(
      verifyTelegramLogin({ ...fields, first_name: "Eve", hash }, botToken),
    ).toBe(false);
  });

  it("rejects stale auth_date (replay protection)", () => {
    const fields = { ...validFields(), auth_date: Math.floor(Date.now() / 1000) - 10 * 60 };
    const hash = signFields(fields);

    expect(verifyTelegramLogin({ ...fields, hash }, botToken)).toBe(false);
  });

  it("rejects missing auth_date", () => {
    const fields = validFields();
    const hash = signFields(fields);
    const { auth_date, ...withoutDate } = { ...fields, hash };

    expect(verifyTelegramLogin(withoutDate as never, botToken)).toBe(false);
  });

  it("rejects an empty hash instead of treating it as vacuously valid", () => {
    const fields = validFields();

    expect(verifyTelegramLogin({ ...fields, hash: "" }, botToken)).toBe(false);
  });

  it("rejects a non-hex hash without throwing", () => {
    const fields = validFields();

    expect(() => verifyTelegramLogin({ ...fields, hash: "not-hex!!" }, botToken)).not.toThrow();
    expect(verifyTelegramLogin({ ...fields, hash: "not-hex!!" }, botToken)).toBe(false);
  });
});
