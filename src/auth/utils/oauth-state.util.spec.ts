import { createOAuthState, verifyOAuthState } from "./oauth-state.util";

describe("oauth-state.util", () => {
  const secret = "test-oauth-state-secret-with-enough-length";

  it("round-trips lang through create -> verify", () => {
    const state = createOAuthState("ru", secret);
    const verified = verifyOAuthState(state, secret);

    expect(verified).not.toBeNull();
    expect(verified?.lang).toBe("ru");
    expect(typeof verified?.nonce).toBe("string");
  });

  it("rejects a state signed with a different secret (forged state)", () => {
    const state = createOAuthState("ru", "attacker-controlled-secret-value");
    const verified = verifyOAuthState(state, secret);

    expect(verified).toBeNull();
  });

  it("rejects a tampered payload even if the signature format looks valid", () => {
    const state = createOAuthState("ru", secret);
    const [payloadB64, signature] = state.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ nonce: "x", lang: "en" })).toString(
      "base64url",
    );
    const tampered = `${tamperedPayload}.${signature}`;

    expect(verifyOAuthState(tampered, secret)).toBeNull();
    expect(payloadB64).not.toBe(tamperedPayload);
  });

  it("rejects malformed tokens (missing separator)", () => {
    expect(verifyOAuthState("not-a-valid-token", secret)).toBeNull();
  });

  it("rejects empty or garbage input", () => {
    expect(verifyOAuthState("", secret)).toBeNull();
    expect(verifyOAuthState("....", secret)).toBeNull();
  });
});
