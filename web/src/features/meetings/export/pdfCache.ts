/**
 * Tiny in-memory LRU of generated PDFs, keyed by the report's content.
 *
 * Re-opening the export dialog for the same summary (close → reopen, or switch the language and
 * back) is instant instead of re-running layout. Blobs are small (tens of KB) and only the last
 * few are kept; the cache lives for the page session and is never persisted.
 */
const MAX_ENTRIES = 3;
const store = new Map<string, Blob>();

/** Same content → same key. The report is plain data, so JSON is a faithful fingerprint. */
export function pdfCacheKey(report: unknown): string {
  return JSON.stringify(report);
}

export function getCachedPdf(key: string): Blob | undefined {
  const hit = store.get(key);
  if (hit) {
    // refresh recency
    store.delete(key);
    store.set(key, hit);
  }
  return hit;
}

export function cachePdf(key: string, blob: Blob): void {
  store.delete(key);
  store.set(key, blob);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Test helper. */
export function clearPdfCache(): void {
  store.clear();
}
