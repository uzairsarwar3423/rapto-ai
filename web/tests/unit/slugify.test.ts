import { describe, expect, it } from "vitest";
import { sanitizeSlugInput, slugify } from "@/lib/utils/slugify";

describe("slugify", () => {
  it.each([
    ["Uzair", "uzair"],
    ["My Team", "my-team"],
    ["Rapto AI", "rapto-ai"],
    ["  My   Team! ", "my-team"],
    ["UPPER lower MiXeD", "upper-lower-mixed"],
    ["Café Über", "cafe-uber"],
    ["Rapto's Team", "raptos-team"],
    ["Café & Co.!!", "cafe-co"],
    ["--a__b--", "a-b"],
    ["100% Real #1", "100-real-1"],
    ["Hello World! This is Rapto.", "hello-world-this-is-rapto"],
    ["", ""],
    ["!!!", ""],
    ["日本語", ""],
  ])("%j -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("caps at 50 characters without leaving a trailing hyphen", () => {
    const out = slugify(`${"a".repeat(49)} bbbb`);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("-")).toBe(false);
  });

  it("tolerates non-string input", () => {
    expect(slugify(undefined as unknown as string)).toBe("");
  });
});

describe("sanitizeSlugInput (live typing)", () => {
  it("keeps a trailing hyphen so the user can keep typing", () => {
    expect(sanitizeSlugInput("my-")).toBe("my-");
    expect(sanitizeSlugInput("My Team")).toBe("my-team");
  });

  it("strips unsupported characters, collapses hyphens, drops a leading hyphen", () => {
    expect(sanitizeSlugInput("--a!!b__c--d")).toBe("ab-c-d"); // "!!" is dropped, "__" becomes a hyphen
    expect(sanitizeSlugInput("ÄB@C")).toBe("bc");
  });
});
