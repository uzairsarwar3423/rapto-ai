import Image from "next/image";

interface MarqueeLogo {
  name: string;
  path: string;
}

const row1Logos: MarqueeLogo[] = [
  { name: "Zoom", path: "/icons/zoom.svg" },
  { name: "Google Meet", path: "/icons/google-meet.svg" },
  { name: "Microsoft Teams", path: "/icons/teams.svg" },
  { name: "Webex", path: "/icons/webex.svg" },
  { name: "Slack", path: "/icons/slack.svg" },
  { name: "Jira", path: "/icons/jira.svg" },
];

const row2Logos: MarqueeLogo[] = [
  { name: "Linear", path: "/icons/linear.svg" },
  { name: "Notion", path: "/icons/notion.svg" },
  { name: "Google Calendar", path: "/icons/google-calender.svg" },
  { name: "Outlook", path: "/icons/outlook.svg" },
  { name: "GitHub", path: "/icons/github.svg" },
  { name: "Asana", path: "/icons/asana.svg" },
];

export function IntegrationsHero() {
  return (
    <section className="relative bg-white pt-24 pb-16 px-6 overflow-hidden flex flex-col items-center">
      {/* Eyebrow */}
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-brand)] mb-4">
        Integrations
      </span>

      {/* Headline */}
      <h1 className="text-center font-serif text-[clamp(40px,5vw,64px)] font-normal text-[var(--color-foreground)] leading-tight tracking-tight max-w-[800px] mb-6">
        Your stack. Rapto{" "}
        <span className="text-[var(--color-brand)] italic">learns it.</span>
      </h1>

      {/* Subheadline */}
      <p className="text-center font-sans font-light text-[clamp(15px,1.8vw,18px)] text-[var(--color-muted)] leading-relaxed max-w-[650px] mb-16">
        Rapto connects to the platforms where your team already works.
        No ripping out tools. No new workflows. Just accountability — added on top.
      </p>

      {/* Scrolling Marquee Container */}
      <div 
        className="w-full max-w-[1200px] relative flex flex-col gap-6 py-6 border-y border-[var(--color-border)] bg-[var(--color-surface)] select-none"
        style={{
          WebkitMaskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
          maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
        }}
      >
        {/* Row 1: Left-to-Right Scrolling */}
        <div className="overflow-hidden flex w-full">
          <div className="animate-marquee-left flex gap-12 items-center">
            {/* First render */}
            {row1Logos.map((logo, index) => (
              <div
                key={`r1-${logo.name}-${index}`}
                className="h-8 w-32 flex items-center justify-center flex-shrink-0"
              >
                <Image
                  src={logo.path}
                  alt={`${logo.name} logo`}
                  width={120}
                  height={32}
                  className="max-h-8 object-contain opacity-40 hover:opacity-100 hover:grayscale-0 grayscale transition-all duration-200"
                />
              </div>
            ))}
            {/* Duplicate for infinite loop */}
            {row1Logos.map((logo, index) => (
              <div
                key={`r1-dup-${logo.name}-${index}`}
                className="h-8 w-32 flex items-center justify-center flex-shrink-0"
              >
                <Image
                  src={logo.path}
                  alt={`${logo.name} logo`}
                  width={120}
                  height={32}
                  className="max-h-8 object-contain opacity-40 hover:opacity-100 hover:grayscale-0 grayscale transition-all duration-200"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Row 2: Right-to-Left Scrolling */}
        <div className="overflow-hidden flex w-full">
          <div className="animate-marquee-right flex gap-12 items-center">
            {/* First render */}
            {row2Logos.map((logo, index) => (
              <div
                key={`r2-${logo.name}-${index}`}
                className="h-8 w-32 flex items-center justify-center flex-shrink-0"
              >
                <Image
                  src={logo.path}
                  alt={`${logo.name} logo`}
                  width={120}
                  height={32}
                  className="max-h-8 object-contain opacity-40 hover:opacity-100 hover:grayscale-0 grayscale transition-all duration-200"
                />
              </div>
            ))}
            {/* Duplicate for infinite loop */}
            {row2Logos.map((logo, index) => (
              <div
                key={`r2-dup-${logo.name}-${index}`}
                className="h-8 w-32 flex items-center justify-center flex-shrink-0"
              >
                <Image
                  src={logo.path}
                  alt={`${logo.name} logo`}
                  width={120}
                  height={32}
                  className="max-h-8 object-contain opacity-40 hover:opacity-100 hover:grayscale-0 grayscale transition-all duration-200"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Marquee Footer text */}
      <span className="mt-6 font-sans text-xs italic text-[var(--color-muted-subtle)] text-center">
        14 integrations connected. More being added every month.
      </span>
    </section>
  );
}
