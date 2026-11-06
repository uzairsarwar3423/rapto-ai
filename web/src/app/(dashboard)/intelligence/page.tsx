import { Suspense } from "react";
import ChatPageLoader from "./ChatPageLoader";

/**
 * Intelligence — grounded meeting chat (Day 59). The chat code is lazy-loaded on the client (see ChatPageLoader), so it
 * adds nothing to any other page's bundle. When the backend feature flag is off the page shows a calm unavailable state.
 */
export default function IntelligencePage() {
  return (
    <Suspense fallback={null}>
      <ChatPageLoader />
    </Suspense>
  );
}
