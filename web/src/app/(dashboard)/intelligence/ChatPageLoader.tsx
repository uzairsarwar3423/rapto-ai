"use client";

import dynamic from "next/dynamic";

// Client-only (uses the auth store, sessionStorage, streams) and code-split off the initial bundle.
const ChatPage = dynamic(() => import("@/features/intelligence/components/ChatPage").then((m) => m.ChatPage), {
  ssr: false,
  loading: () => <div className="h-[60vh]" aria-busy="true" />,
});

export default function ChatPageLoader() {
  return <ChatPage />;
}
