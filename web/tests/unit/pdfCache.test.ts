import { beforeEach, describe, expect, it } from "vitest";
import { cachePdf, clearPdfCache, getCachedPdf, pdfCacheKey } from "@/features/meetings/export/pdfCache";

const blob = (label: string) => new Blob([label], { type: "application/pdf" });

describe("pdfCache", () => {
  beforeEach(() => clearPdfCache());

  it("keys by content, not object identity", () => {
    expect(pdfCacheKey({ a: 1, b: ["x"] })).toBe(pdfCacheKey({ a: 1, b: ["x"] }));
    expect(pdfCacheKey({ a: 1 })).not.toBe(pdfCacheKey({ a: 2 }));
  });

  it("returns what was cached and nothing for unknown keys", () => {
    const b = blob("one");
    cachePdf("k1", b);
    expect(getCachedPdf("k1")).toBe(b);
    expect(getCachedPdf("missing")).toBeUndefined();
  });

  it("keeps only the 3 most recently used entries", () => {
    cachePdf("a", blob("a"));
    cachePdf("b", blob("b"));
    cachePdf("c", blob("c"));
    getCachedPdf("a"); // a becomes most recent → b is now the oldest
    cachePdf("d", blob("d"));
    expect(getCachedPdf("b")).toBeUndefined();
    expect(getCachedPdf("a")).toBeDefined();
    expect(getCachedPdf("c")).toBeDefined();
    expect(getCachedPdf("d")).toBeDefined();
  });

  it("overwriting a key does not grow the cache", () => {
    cachePdf("a", blob("1"));
    cachePdf("a", blob("2"));
    cachePdf("b", blob("b"));
    cachePdf("c", blob("c"));
    expect(getCachedPdf("a")).toBeDefined();
  });
});
