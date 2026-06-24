import { Calendar, Clock, Video, Users, ShieldAlert, Lock } from "lucide-react";

export function MockCalendarEvent() {
  const attendees = [
    { name: "Ali Raza", initials: "AR", color: "bg-[#039BE5]" },
    { name: "Ahmed Hassan", initials: "AH", color: "bg-[#E2B33C]" },
    { name: "Sara Khan", initials: "SK", color: "bg-[#33B679]" },
    { name: "Vocaply Bot", initials: "VB", color: "bg-[#1A6B3C]", active: true },
  ];

  return (
    <div className="flex flex-col w-full h-full bg-[#FAFAF8] text-[#3C4043] font-sans p-6 overflow-y-auto">
      {/* Calendar Card Frame */}
      <div className="flex-1 flex flex-col bg-white border border-[#DADCE0] rounded-xl shadow-sm max-w-[500px] mx-auto w-full overflow-hidden">
        {/* Header Bar */}
        <div className="bg-[#E8F0FE] px-5 py-3 border-b border-[#DADCE0] flex items-center gap-2">
          <Calendar className="w-4.5 h-4.5 text-[#1A73E8]" />
          <span className="font-semibold text-xs text-[#1A73E8] tracking-wider uppercase">Google Calendar</span>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {/* Title */}
          <div>
            <h3 className="text-base font-bold text-[#202124] leading-tight">
              Monday Engineering Standup
            </h3>
          </div>

          {/* Time info */}
          <div className="flex items-center gap-3 text-xs text-[#5F6368] font-medium">
            <Clock className="w-4 h-4 text-[#5F6368]" />
            <span>Monday, May 12 &bull; 9:00 AM – 9:30 AM (GMT+5)</span>
          </div>

          {/* Location / Video */}
          <div className="flex items-center gap-3 text-xs text-[#1A73E8] font-semibold">
            <Video className="w-4 h-4 text-[#5F6368]" />
            <span className="hover:underline cursor-pointer">Join Zoom Meeting (zoom.us/j/9842...)</span>
          </div>

          {/* Attendees */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 text-xs text-[#5F6368] font-medium">
              <Users className="w-4 h-4" />
              <span>4 Attendees</span>
            </div>
            
            {/* Attendees list */}
            <div className="flex flex-wrap gap-2 pl-7">
              {attendees.map((attendee) => (
                <div
                  key={attendee.name}
                  className="flex items-center gap-1.5 bg-[#F1F3F4] px-2 py-1 rounded-full text-xs font-medium text-[#3C4043] border border-[#E8EAED]"
                >
                  <div className={`h-4.5 w-4.5 rounded-full ${attendee.color} text-white flex items-center justify-center text-[8px] font-bold`}>
                    {attendee.initials}
                  </div>
                  <span>{attendee.name}</span>
                  {attendee.active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] ml-1 animate-pulse" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Vocaply Banner notification */}
          <div className="mt-2 bg-[var(--color-brand-subtle)] border border-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-brand)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-brand)]"></span>
            </span>
            <span className="text-xs text-[var(--color-brand)] font-semibold">
              Vocaply will join and track commitments automatically.
            </span>
          </div>
        </div>
      </div>

      {/* Privacy disclaimer note below the card */}
      <div className="mt-4 max-w-[500px] mx-auto w-full bg-[#FAFAF8] border border-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] rounded-lg p-3 flex gap-2.5 items-start">
        <Lock className="w-4 h-4 text-[var(--color-brand)] mt-0.5 flex-shrink-0" />
        <div className="text-[11px] text-[var(--color-muted)] leading-relaxed">
          <span className="font-semibold text-[var(--color-foreground)]">Privacy Guarantee:</span> Vocaply only reads calendar event titles and meeting URLs. It never accesses event details, attendee email bodies, or calendar data beyond what&apos;s required to schedule the recorder.
        </div>
      </div>
    </div>
  );
}
