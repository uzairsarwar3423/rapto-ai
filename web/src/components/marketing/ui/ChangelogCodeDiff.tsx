"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface ChangelogCodeDiffProps {
  code: string;
}

export function ChangelogCodeDiff({ code }: ChangelogCodeDiffProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg overflow-hidden border border-[var(--color-border)] mt-4 bg-[#0E0E0E] shadow-sm max-w-[600px] w-full font-mono text-[12px] leading-relaxed">
      {/* Header bar */}
      <div className="flex justify-between items-center bg-[#181818] px-4 py-2 border-b border-[#242424] text-white/50 select-none">
        <span>API Schema Payload</span>
        <button
          onClick={handleCopy}
          className="p-1 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Code Area */}
      <pre className="p-4 text-white/90 overflow-x-auto whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
    </div>
  );
}
