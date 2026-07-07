"use client";

import { useState } from "react";
import { Code2, Copy, Check, ArrowRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function IntegrationsAPISection() {
  const [activeTab, setActiveTab] = useState<"curl" | "json">("curl");
  const [copied, setCopied] = useState(false);

  const curlCode = `curl https://api.rapto.ai/api/v1/commitments \\
  -H "Authorization: Bearer vply_live_..." \\
  -H "Content-Type: application/json"`;

  const jsonCode = `{
  "success": true,
  "data": [
    {
      "id": "com_abc123",
      "text": "Finish login feature in checkout",
      "status": "PENDING",
      "owner": {
        "name": "Ahmed Hassan",
        "email": "ahmed@rapto.ai"
      },
      "dueDate": "2026-05-15T23:59:59Z"
    }
  ]
}`;

  const copyToClipboard = () => {
    const code = activeTab === "curl" ? curlCode : jsonCode;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const useCases = [
    "Custom Slack bots that query commitment statistics",
    "Business Intelligence dashboard integrations (Metabase, Tableau)",
    "Automated weekly status updates sent directly to your inbox",
    "Custom scoring engines to rate team follow-through velocity",
  ];

  return (
    <section className="py-20 px-6 bg-[#0A0A0A] text-white border-b border-[#1A1D21]">
      <div className="max-w-[1120px] mx-auto flex flex-col lg:flex-row items-center gap-12">
        {/* Left Column — Text info */}
        <div className="flex-1 flex flex-col w-full">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5" />
            For Developers
          </span>
          
          <h2 className="font-serif text-[clamp(28px,3.5vw,38px)] font-normal leading-tight tracking-tight mb-4">
            Build your own on top of Rapto.
          </h2>
          
          <p className="font-sans text-[13px] text-white/60 leading-relaxed mb-8 max-w-[500px]">
            Use the Rapto API to pull commitment data into your own tools, dashboard portals, or internal databases. We offer a full REST API with Webhook subscriptions.
          </p>

          <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider mb-3.5">
            What you can build:
          </h4>
          
          <ul className="flex flex-col gap-3.5 mb-8 font-sans">
            {useCases.map((useCase, idx) => (
              <li key={idx} className="flex gap-2.5 items-start">
                <span className="h-4.5 w-4.5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs text-white/70 font-mono">
                  {idx + 1}
                </span>
                <span className="text-xs text-white/75 leading-relaxed">
                  {useCase}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/docs/api"
              className="inline-flex items-center gap-1.5 px-4.5 py-2.5 rounded bg-white text-black font-sans font-semibold text-xs transition-colors hover:bg-white/95"
            >
              Create API Key
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <a
              href="/docs"
              className="inline-flex items-center gap-1.5 px-4.5 py-2.5 rounded border border-white/20 text-white/80 font-sans font-semibold text-xs transition-all hover:border-white hover:text-white"
            >
              View API Docs
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Right Column — Simulated API Code Viewer */}
        <div className="flex-1 w-full flex flex-col bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          {/* Header tabs */}
          <div className="flex justify-between items-center bg-white/5 px-4 py-2.5 border-b border-white/10">
            <div className="flex gap-1.5">
              <button
                onClick={() => setActiveTab("curl")}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-colors select-none",
                  activeTab === "curl" ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
                )}
              >
                Request (cURL)
              </button>
              <button
                onClick={() => setActiveTab("json")}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-colors select-none",
                  activeTab === "json" ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
                )}
              >
                Response (JSON)
              </button>
            </div>
            
            <button
              onClick={copyToClipboard}
              className="p-1.5 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors"
              title="Copy code"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Code Body */}
          <pre className="p-5 font-mono text-[12.5px] leading-relaxed text-white/80 overflow-x-auto min-h-[170px] bg-[#0E0E0E]">
            <code>
              {activeTab === "curl" ? curlCode : jsonCode}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}
