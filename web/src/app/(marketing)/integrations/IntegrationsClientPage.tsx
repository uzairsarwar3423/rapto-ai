"use client";

import { Suspense } from "react";
import { Video, CheckSquare, Check, ShieldAlert } from "lucide-react";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";
import { FinalCTA } from "@/components/marketing/sections/FinalCTA";
import { useIntegrationFilter } from "@/hooks/marketing/useIntegrationFilter";

// Section components
import { IntegrationsHero } from "@/components/marketing/sections/IntegrationsHero";
import { IntegrationsTabFilter } from "@/components/marketing/sections/IntegrationsTabFilter";
import { IntegrationsGrid } from "@/components/marketing/sections/IntegrationsGrid";
import { IntegrationDeepDive, DeepDiveStep } from "@/components/marketing/sections/IntegrationDeepDive";
import { IntegrationsHowItWorks } from "@/components/marketing/sections/IntegrationsHowItWorks";
import { IntegrationsAPISection } from "@/components/marketing/sections/IntegrationsAPISection";
import { IntegrationRequestForm } from "@/components/marketing/sections/IntegrationRequestForm";

// Mock Visual UI Components
import { MockJiraTicket } from "@/components/marketing/ui/MockJiraTicket";
import { MockSlackMessage } from "@/components/marketing/ui/MockSlackMessage";
import { MockCalendarEvent } from "@/components/marketing/ui/MockCalendarEvent";

function IntegrationsContent() {
  const { activeCategory, filteredIntegrations, setCategory } = useIntegrationFilter();

  const jiraSteps: DeepDiveStep[] = [
    {
      label: "Bot Joins Call",
      sublabel: "Records & transcribes standup",
      icon: <Video className="w-4 h-4 text-white" />,
    },
    {
      label: "AI Extract",
      sublabel: "Finds commitments",
      icon: <CheckSquare className="w-4 h-4 text-white" />,
    },
    {
      label: "Ticket Created",
      sublabel: "Auto-synced to Jira backlog",
      icon: <Check className="w-4 h-4 text-white" />,
    },
  ];

  return (
    <>
      {/* Hero */}
      <IntegrationsHero />

      {/* Tab Filter bar */}
      <IntegrationsTabFilter
        activeCategory={activeCategory}
        onCategoryChange={setCategory}
      />

      {/* Grid */}
      <IntegrationsGrid integrations={filteredIntegrations} />

      {/* Deep-Dive sections */}
      <div className="border-t border-[var(--color-border)]">
        {/* Jira Deep Dive */}
        <IntegrationDeepDive
          id="jira-integration"
          theme="white"
          eyebrow="Jira Integration"
          title={
            <>
              Standups that write{" "}
              <span className="text-[var(--color-brand)] italic">their own Jira tickets.</span>
            </>
          }
          descriptionBullets={[
            "Action items from standups automatically create Jira issues in the correct backlog.",
            "Assignees matched to Jira users by email — no manual linking configuration required.",
            "When a Jira issue is marked 'Done', the corresponding Rapto commitment is automatically fulfilled.",
          ]}
          steps={jiraSteps}
          visualComponent={<MockJiraTicket />}
          urlText="jira.atlassian.com/browse/TECH-248"
          ctaText="Connect Jira"
        />

        {/* Slack Deep Dive */}
        <IntegrationDeepDive
          id="slack-integration"
          theme="gray"
          eyebrow="Slack Integration"
          title={
            <>
              Your team sees every commitment —{" "}
              <span className="text-[var(--color-brand)] italic">in Slack.</span>
            </>
          }
          descriptionBullets={[
            "Meeting summaries are automatically formatted and posted to your designated channels.",
            "Missed commitments trigger a direct, personal Slack DM to the assignee with action buttons.",
            "Managers receive summarized DM digests of pending, fulfilled, or missed deadlines.",
          ]}
          visualComponent={<MockSlackMessage />}
          urlText="slack.com/workspace/engineering"
          ctaText="Connect Slack"
        />

        {/* Calendar Deep Dive */}
        <IntegrationDeepDive
          id="calendar-integration"
          theme="white"
          eyebrow="Google Calendar Integration"
          title={
            <>
              It knows your meetings{" "}
              <span className="text-[var(--color-brand)] italic">before they happen.</span>
            </>
          }
          descriptionBullets={[
            "Synchronizes with Google Calendar automatically — no manual event copying required.",
            "The Rapto bot schedules itself and joins 2 minutes before the call starts.",
            "Detects and supports Zoom, Google Meet, and Microsoft Teams meeting URLs inside event details.",
          ]}
          visualComponent={<MockCalendarEvent />}
          urlText="calendar.google.com/event/93425"
          ctaText="Connect Google Calendar"
        />
      </div>

      {/* How it works connection flow */}
      <IntegrationsHowItWorks />

      {/* API teaser section */}
      <IntegrationsAPISection />

      {/* Request integration form */}
      <IntegrationRequestForm />
    </>
  );
}

export function IntegrationsClientPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement banner */}
      <AnnouncementBar />

      {/* Sticky navigation */}
      <MarketingNav />

      {/* Main content wrapped in Suspense for searchParams hydration safety */}
      <main id="main-content" className="flex-grow">
        <Suspense fallback={
          <div className="flex items-center justify-center py-32 text-sm text-[var(--color-muted)] font-sans">
            Loading integrations...
          </div>
        }>
          <IntegrationsContent />
        </Suspense>
        
        {/* Reuse the Final CTA banner */}
        <FinalCTA />
      </main>

      {/* Footer */}
      <MarketingFooter />

      {/* Mobile sticky CTA bar */}
      <MobileCTABar />
    </div>
  );
}
