import { MessageSquare, Bell, MoreHorizontal, Smile, Pin } from "lucide-react";
import { cn } from "@/lib/utils";

export function MockSlackMessage() {
  return (
    <div className="flex flex-col lg:flex-row w-full bg-[#1A1D21] text-[#D1D2D3] font-sans text-[13px] h-full overflow-y-auto">
      {/* Sidebar Mock (Left Side, thin on Desktop, hidden on Mobile) */}
      <div className="hidden md:flex flex-col w-48 bg-[#19171D] border-r border-[#2C2B30] text-[#BCABB6] p-3 gap-4 flex-shrink-0">
        <div>
          <div className="flex items-center justify-between text-white font-bold text-sm mb-4 px-2">
            <span>Vocaply Workspace</span>
          </div>
          <div className="flex flex-col gap-1.5 font-normal">
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#1164A3] text-white font-semibold">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>DMs & Channels</span>
            </div>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-semibold text-[#BCABB6]/60 px-2 uppercase tracking-wide">
            Channels
          </span>
          <div className="flex flex-col gap-1 mt-1">
            <span className="px-2 py-1 hover:bg-[#350D36]/20 rounded cursor-pointer"># general</span>
            <span className="px-2 py-1 bg-[#350D36]/40 text-white rounded font-medium cursor-pointer"># engineering</span>
            <span className="px-2 py-1 hover:bg-[#350D36]/20 rounded cursor-pointer"># product-updates</span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-semibold text-[#BCABB6]/60 px-2 uppercase tracking-wide">
            Direct Messages
          </span>
          <div className="flex flex-col gap-1 mt-1">
            <span className="px-2 py-1 hover:bg-[#350D36]/20 rounded cursor-pointer flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2BAC76]"></span>
              Ahmed Hassan
            </span>
            <span className="px-2 py-1 hover:bg-[#350D36]/20 rounded cursor-pointer flex items-center gap-1.5 font-semibold text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2BAC76]"></span>
              Vocaply Bot
            </span>
          </div>
        </div>
      </div>

      {/* Main Slack Message Pane */}
      <div className="flex-1 flex flex-col h-full bg-[#1A1D21] border-r border-[#2C2B30]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#2C2B30] flex-shrink-0 bg-[#1A1D21]">
          <div className="flex flex-col">
            <span className="font-bold text-white text-sm">#engineering</span>
            <span className="text-xs text-[#ABABAD]">Company standups & commitments</span>
          </div>
          <div className="flex items-center gap-3 text-[#ABABAD]">
            <Bell className="w-4 h-4 cursor-pointer hover:text-white" />
            <MoreHorizontal className="w-4 h-4 cursor-pointer hover:text-white" />
          </div>
        </div>

        {/* Message feed */}
        <div className="flex-1 p-4 flex flex-col gap-5 overflow-y-auto">
          {/* Vocaply Bot Summary Message */}
          <div className="flex gap-2.5 items-start">
            <div className="h-8 w-8 rounded bg-[#1A6B3C] text-white flex items-center justify-center font-serif font-bold text-base flex-shrink-0 shadow-sm">
              V
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-white">Vocaply</span>
                <span className="text-[10px] text-[#ABABAD] bg-[#222529] px-1 rounded-sm font-bold uppercase tracking-wider">APP</span>
                <span className="text-[10px] text-[#ABABAD]">9:30 AM</span>
              </div>

              {/* Block Kit summary UI block */}
              <div className="mt-2 bg-[#222529] border border-[#2C2B30] rounded-md p-4 max-w-[500px]">
                <div className="font-bold text-sm text-white flex items-center gap-1.5 mb-1.5">
                  📋 Monday Standup — Summary
                </div>
                <div className="text-xs text-[#ABABAD] mb-3">
                  28 min &middot; 5 participants &middot; 3 commitments extracted
                </div>
                <div className="w-full h-[1px] bg-[#2C2B30] mb-3" />

                <div className="font-semibold text-white mb-2">✅ 3 New Commitments:</div>
                <ul className="flex flex-col gap-1.5 text-xs text-[#D1D2D3] pl-1 list-none">
                  <li className="flex items-start gap-1">
                    <span className="text-emerald-500 font-semibold">•</span>
                    <div>
                      <span className="font-medium text-white">Ahmed Hassan</span> &rarr; Fix payment bug <span className="text-amber-500 font-medium">(Thu, May 15)</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-1">
                    <span className="text-emerald-500 font-semibold">•</span>
                    <div>
                      <span className="font-medium text-white">Sara Khan</span> &rarr; Send design files <span className="text-emerald-500 font-medium">(Wed, May 14)</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-1">
                    <span className="text-emerald-500 font-semibold">•</span>
                    <div>
                      <span className="font-medium text-white">Ali Raza</span> &rarr; Review PRs <span className="text-blue-400 font-medium">(Today EOD)</span>
                    </div>
                  </li>
                </ul>

                <button className="mt-4 px-3 py-1.5 bg-[#1F2226] border border-[#383A3F] hover:bg-[#2F3237] text-white font-semibold rounded text-xs transition-colors shadow-sm select-none">
                  View Full Summary
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DM Mock (Right Side - DM from bot) */}
      <div className="w-full lg:w-72 bg-[#1A1D21] flex flex-col h-full border-t lg:border-t-0 border-[#2C2B30]">
        <div className="px-4 py-2 border-b border-[#2C2B30] font-bold text-white text-sm bg-[#1A1D21] flex-shrink-0">
          Vocaply Bot (Direct Message)
        </div>
        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
          <div className="flex gap-2 items-start">
            <div className="h-6 w-6 rounded bg-[#1A6B3C] text-white flex items-center justify-center font-serif font-bold text-xs flex-shrink-0">
              V
            </div>
            <div>
              <div className="flex items-baseline gap-1.5 mb-1.5">
                <span className="font-bold text-white text-xs">Vocaply Bot</span>
                <span className="text-[9px] text-[#ABABAD]">Yesterday</span>
              </div>
              <p className="text-xs text-[#D1D2D3] leading-relaxed mb-3">
                Hi Ahmed, your commitment is due tomorrow:
              </p>
              
              {/* Personal reminder details */}
              <div className="bg-[#222529] border-l-2 border-[var(--color-brand)] p-3 rounded-r-md text-xs mb-3">
                <span className="font-semibold text-white block mb-0.5">&rarr; Fix payment bug in checkout flow</span>
                <span className="text-[#ABABAD] text-[11px]">Due: Thursday, May 15</span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button className="px-2.5 py-1 bg-[#1A6B3C] hover:bg-[#155430] text-white font-bold rounded text-[11px] shadow-sm select-none transition-colors">
                  Mark fulfilled
                </button>
                <button className="px-2.5 py-1 bg-[#222529] border border-[#383A3F] hover:bg-[#2F3237] text-white font-semibold rounded text-[11px] shadow-sm select-none transition-colors">
                  Snooze 1 day
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
