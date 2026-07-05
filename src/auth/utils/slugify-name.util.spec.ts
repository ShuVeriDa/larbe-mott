import { slugifyName } from "./slugify-name.util";

describe("slugifyName", () => {
  it("keeps ASCII names unchanged (lowercased, trimmed to 12 chars)", () => {
    expect(slugifyName("Alice")).toBe("alice");
    expect(slugifyName("Christopherson")).toBe("christophers"); // 12-char cap
  });

  it("transliterates Cyrillic names to ASCII instead of collapsing to empty", () => {
    expect(slugifyName("Сайд-Магомед")).toBe("saydmagomed");
    expect(slugifyName("Иван")).toBe("ivan");
    expect(slugifyName("Юлия")).toBe("yuliya");
  });

  it("strips the Chechen Palochka (Ӏ) and hyphens without producing empty output", () => {
    expect(slugifyName("ӀӀӀ")).toBe("user"); // nothing left to transliterate -> fallback
    expect(slugifyName("Али-Ӏела")).not.toBe("");
  });

  it("falls back to the email local-part when firstName yields nothing usable", () => {
    expect(slugifyName("", "ivan.petrov")).toBe("ivanpetrov");
    expect(slugifyName(undefined, "ivan.petrov@example.com".split("@")[0])).toBe("ivanpetrov");
  });

  it("falls back to a stable literal 'user' when every candidate is unusable", () => {
    expect(slugifyName("", "")).toBe("user");
    expect(slugifyName(null, null)).toBe("user");
    expect(slugifyName("!!!", "###")).toBe("user");
  });

  it("never returns a string containing anything but lowercase a-z0-9", () => {
    const samples = ["Сайд-Магомед", "José García", "田中太郎", "!!!", "Ana-María"];
    for (const s of samples) {
      expect(slugifyName(s)).toMatch(/^[a-z0-9]+$/);
    }
  });
});
