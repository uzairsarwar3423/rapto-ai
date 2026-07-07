import { Plug, Globe, CheckCircle } from "lucide-react";

export function IntegrationsHowItWorks() {
  const steps = [
    {
      icon: <Plug className="w-7 h-7 text-[var(--color-brand)]" />,
      title: "Click Connect",
      description: "Find the integration in your Workspace Settings page and click the Connect button.",
    },
    {
      icon: <Globe className="w-7 h-7 text-[var(--color-brand)]" />,
      title: "Authorize on Their Site",
      description: "You are securely redirected to Jira, Slack, or Google's login page. We never see your password.",
    },
    {
      icon: <CheckCircle className="w-7 h-7 text-[var(--color-brand)]" />,
      title: "Active in Under a Minute",
      description: "You're redirected back to Rapto. The integration is active. No complex configuration required.",
    },
  ];

  const badges = ["SOC 2 (In Progress)", "OAuth 2.0 Secure", "TLS 1.3 Encryption", "AES-256 Data Protection"];

  return (
    <section className="py-20 px-6 bg-[var(--color-surface)] border-b border-[var(--color-border)] text-center">
      <div className="max-w-[1120px] mx-auto">
        {/* Header */}
        <h2 className="font-serif text-[clamp(28px,3.5vw,36px)] font-normal text-[var(--color-foreground)] leading-tight mb-3">
          One click to connect. Zero data risk.
        </h2>
        <p className="font-sans text-sm text-[var(--color-muted)] max-w-[550px] mx-auto mb-16">
          All integrations use OAuth 2.0 protocols — you authorize, we connect. Rapto never stores password data.
        </p>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative mb-16">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col items-center max-w-[320px] mx-auto relative z-10">
              <div className="h-14 w-14 rounded-xl bg-[var(--color-brand-subtle)] border border-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] flex items-center justify-center mb-5 shadow-xs">
                {step.icon}
              </div>
              <h3 className="font-sans font-semibold text-[15px] text-[var(--color-foreground)] mb-2.5">
                {step.title}
              </h3>
              <p className="font-sans text-[13px] text-[var(--color-muted)] leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}

          {/* Connection lines (SVG dashed lines between columns) */}
          <div className="hidden md:block absolute top-7 left-[20%] right-[20%] h-[1px] border-t-2 border-dashed border-[var(--color-border)] z-0" />
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-8 border-t border-[var(--color-border)]">
          {badges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center px-3 py-1 rounded-md text-[11px] font-medium font-mono bg-white text-[var(--color-muted-subtle)] border border-[var(--color-border)]"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
