"use client";

import { Component, type ReactNode } from "react";

/** Contains a render crash inside the chat so the rest of the app (sidebar, nav) stays alive. */
export class ChatErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: Error) {
    console.error("[chat] render crash:", error.name);
  }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div role="alert" className="grid h-full place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm">The chat hit a problem and was stopped.</p>
          <button type="button" className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-surface" onClick={() => this.setState({ crashed: false })}>
            Reload chat
          </button>
        </div>
      </div>
    );
  }
}
