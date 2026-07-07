import { CheckSquare, ArrowUp, Calendar, Tag, ShieldCheck, User } from "lucide-react";

export function MockJiraTicket() {
  return (
    <div className="flex flex-col md:flex-row w-full h-full bg-[#FFFFFF] font-sans text-sm text-[#172B4D] overflow-y-auto">
      {/* Main Ticket Content (Left Side) */}
      <div className="flex-1 p-6 border-r border-[#DFE1E6]">
        {/* Project Path Header */}
        <div className="flex items-center gap-1.5 text-xs text-[#5E6C84] mb-3 font-medium">
          <span>Projects</span>
          <span>/</span>
          <span className="hover:underline cursor-pointer">TechFlow Engineering</span>
          <span>/</span>
          <span>TECH-248</span>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-[#172B4D] mb-5 tracking-tight leading-snug">
          Fix payment bug in checkout flow
        </h2>

        {/* Description Section */}
        <div className="mb-6">
          <h4 className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider mb-2">
            Description
          </h4>
          <p className="text-[#172B4D] leading-relaxed bg-[#FAFBFC] p-3.5 rounded border border-[#DFE1E6] font-light">
            Customer reported checkout freezes when clicking the &quot;Pay Now&quot; button while using Apple Pay in safari. Need to inspect the stripe callback handler.
          </p>
        </div>

        {/* Rapto AI Activity Comment */}
        <div>
          <h4 className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider mb-3">
            Activity (Rapto AI)
          </h4>
          <div className="flex gap-3 items-start bg-[var(--color-brand-subtle)] p-3.5 rounded-lg border border-[color-mix(in_srgb,var(--color-brand)_12%,transparent)]">
            <div className="h-7 w-7 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-white font-serif font-bold text-xs flex-shrink-0 shadow-sm">
              V
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-xs text-[var(--color-brand)]">Rapto Integration</span>
                <span className="text-[10px] text-[#5E6C84]">May 12, 9:28 AM</span>
              </div>
              <p className="text-xs text-[#253858] leading-relaxed">
                Created automatically from <span className="font-semibold text-[var(--color-brand)]">Monday Engineering Standup</span>. 
                Extracted commitment from transcript: <span className="italic font-normal">&quot;Ahmed: I will look into fixing the payment checkout bug on Apple Pay by Thursday.&quot;</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket Attributes Sidebar (Right Side) */}
      <div className="w-full md:w-64 bg-[#FAFBFC] p-6 flex flex-col gap-5">
        {/* Status */}
        <div>
          <span className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider block mb-2">
            Status
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded font-bold text-xs uppercase bg-[#DEEBFF] text-[#0747A6] tracking-wide select-none">
            To Do
          </span>
        </div>

        {/* Assignee */}
        <div>
          <span className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider block mb-1.5">
            Assignee
          </span>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-[#E2B33C] text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
              AH
            </div>
            <span className="text-sm font-medium text-[#172B4D]">Ahmed Hassan</span>
          </div>
        </div>

        {/* Reporter */}
        <div>
          <span className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider block mb-1.5">
            Reporter
          </span>
          <div className="flex items-center gap-2 text-[var(--color-brand)]">
            <div className="h-6 w-6 rounded-full bg-[var(--color-brand-subtle)] border border-[var(--color-brand)] flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-brand)]" />
            </div>
            <span className="text-sm font-semibold">Rapto (AI)</span>
          </div>
        </div>

        {/* Priority */}
        <div>
          <span className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider block mb-1.5">
            Priority
          </span>
          <div className="flex items-center gap-1.5 text-xs text-[#DE350B] font-bold">
            <ArrowUp className="w-4 h-4" />
            <span>HIGH</span>
          </div>
        </div>

        {/* Due Date */}
        <div>
          <span className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider block mb-1.5">
            Due Date
          </span>
          <div className="flex items-center gap-1.5 text-xs text-[#172B4D] font-medium">
            <Calendar className="w-4 h-4 text-[#5E6C84]" />
            <span>May 15, 2026</span>
          </div>
        </div>

        {/* Labels */}
        <div>
          <span className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider block mb-1.5">
            Labels
          </span>
          <div className="flex flex-wrap gap-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F4F5F7] border border-[#DFE1E6] text-[10px] text-[#42526E] font-medium">
              <Tag className="w-2.5 h-2.5" />
              rapto
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F4F5F7] border border-[#DFE1E6] text-[10px] text-[#42526E] font-medium">
              <Tag className="w-2.5 h-2.5" />
              action-item
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
