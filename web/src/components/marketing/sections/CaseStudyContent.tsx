"use client";

import { motion } from "framer-motion";

const QuoteIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M14.017 18L14.017 10.609C14.017 4.905 17.748 1.039 23 0L23.995 2.151C21.563 3.068 20 5.789 20 8H24V18H14.017ZM0 18V10.609C0 4.905 3.748 1.038 9 0L9.996 2.151C7.563 3.068 6 5.789 6 8H9.983L9.983 18L0 18Z" />
  </svg>
);

export function CaseStudyContent() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="prose prose-lg dark:prose-invert prose-headings:font-sans prose-p:font-sans prose-a:text-brand hover:prose-a:text-brand-mid max-w-none"
        >
          <h2 style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }} className="text-3xl font-bold mb-6 text-foreground tracking-tight">
            The Challenge: Scaling Async Communication
          </h2>
          <p className="text-muted leading-relaxed mb-8">
            As TechCorp rapidly expanded from 50 to over 200 engineers, their daily standups 
            became a bottleneck. What used to be a quick 10-minute sync devolved into 
            30-minute status reports where crucial commitments were frequently forgotten or 
            lost in a sea of Slack messages. Project managers spent up to 8 hours a week just 
            chasing down engineers to ask, <em>"Did you finish that task you mentioned on Tuesday?"</em>
          </p>

          <div className="my-12 p-8 rounded-2xl bg-brand/5 border border-brand/10 relative">
            <QuoteIcon className="absolute top-6 left-6 w-10 h-10 text-brand/20" />
            <blockquote className="relative z-10 m-0 border-none p-0 text-xl font-medium text-foreground leading-relaxed italic mb-6">
              "We were moving fast, but our accountability was dropping. We tried writing notes 
              manually, but engineers hated the overhead. We needed something invisible but strict."
            </blockquote>
            <div className="flex items-center gap-4">
              <img src="https://i.pravatar.cc/100?img=4" alt="Sarah Jenkins" className="w-12 h-12 rounded-full object-cover" />
              <div>
                <p className="font-bold text-foreground font-sans m-0 text-base">Sarah Jenkins</p>
                <p className="text-sm text-muted m-0 font-sans">VP of Engineering, TechCorp</p>
              </div>
            </div>
          </div>

          <h2 style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }} className="text-3xl font-bold mb-6 text-foreground tracking-tight mt-12">
            The Solution: Invisible Accountability
          </h2>
          <p className="text-muted leading-relaxed mb-6">
            TechCorp integrated Rapto into their Google Workspace. Instantly, the Rapto AI bot 
            began joining their daily standups. There was no new software for the engineers to learn, 
            and no new processes to follow. 
          </p>
          <ul className="space-y-4 mb-8 text-muted list-disc pl-6 font-sans">
            <li><strong>Automated Extraction:</strong> Rapto passively listened and extracted action items in real-time.</li>
            <li><strong>Jira Sync:</strong> Commitments were automatically synced to their respective Jira epic boards.</li>
            <li><strong>Smart Nudges:</strong> Engineers received automated Slack pings only when a commitment was nearing its deadline.</li>
          </ul>

          <h2 style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }} className="text-3xl font-bold mb-6 text-foreground tracking-tight mt-12">
            The Result: Peace of Mind
          </h2>
          <p className="text-muted leading-relaxed mb-8">
            Within the first month, the number of dropped tasks fell by an astonishing 85%. 
            Engineering managers completely stopped manual follow-ups, reclaiming an entire day 
            of work each week. More importantly, team morale improved as the "nagging" was 
            offloaded to an impartial system.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
