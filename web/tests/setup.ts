import { afterEach } from "vitest";

// Component suites run in jsdom; unmount between tests so the DOM never leaks across cases.
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
