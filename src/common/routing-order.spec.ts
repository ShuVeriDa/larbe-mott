import { readFileSync } from "fs";
import { join } from "path";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), "src", relativePath), "utf8");
}

describe("Routing order guards against static/param conflicts", () => {
  it("should register texts bookmarks route before :id route", () => {
    const source = readSource("text/text.controller.ts");
    expect(source.indexOf('@Get("bookmarks")')).toBeGreaterThan(-1);
    expect(source.indexOf('@Get(":id")')).toBeGreaterThan(-1);
    expect(source.indexOf('@Get("bookmarks")')).toBeLessThan(source.indexOf('@Get(":id")'));
  });

  it("should register dictionary folders patch route before :id patch route", () => {
    const source = readSource("dictionary/dictionary.controller.ts");
    expect(source.indexOf('@Patch("folders/:id")')).toBeGreaterThan(-1);
    expect(source.indexOf('@Patch(":id")')).toBeGreaterThan(-1);
    expect(source.indexOf('@Patch("folders/:id")')).toBeLessThan(source.indexOf('@Patch(":id")'));
  });

  it("should register dictionary folders delete route before :id delete route", () => {
    const source = readSource("dictionary/dictionary.controller.ts");
    expect(source.indexOf('@Delete("folders/:id")')).toBeGreaterThan(-1);
    expect(source.indexOf('@Delete(":id")')).toBeGreaterThan(-1);
    expect(source.indexOf('@Delete("folders/:id")')).toBeLessThan(source.indexOf('@Delete(":id")'));
  });
});
