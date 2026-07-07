"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Clock, Rocket, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type RoadmapStatus = "planned" | "in-progress" | "shipped";

interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  date?: string;
  tag?: string;
}

const roadmapItems: RoadmapItem[] = [
  {
    id: "1",
    title: "Jira Integration",
    description: "Two-way sync for action items directly to your Jira boards, complete with issue assignment and status tracking.",
    status: "shipped",
    date: "Q3 2026",
    tag: "Integrations",
  },
  {
    id: "2",
    title: "Custom Meeting Templates",
    description: "Define your own meeting structures and let Rapto's AI adapt its commitment extraction to your specific needs.",
    status: "shipped",
    date: "Q2 2026",
    tag: "Core",
  },
  {
    id: "3",
    title: "Advanced Analytics Dashboard",
    description: "Gain deeper insights into team velocity, commitment completion rates, and individual performance metrics.",
    status: "in-progress",
    tag: "Analytics",
  },
  {
    id: "4",
    title: "Slack Bot Enhancements",
    description: "Interact with Rapto directly from Slack to query status, update commitments, and get real-time digests.",
    status: "in-progress",
    tag: "Integrations",
  },
  {
    id: "5",
    title: "Multi-Language Support",
    description: "Automatic transcription and commitment extraction in over 30 languages, perfect for global remote teams.",
    status: "planned",
    tag: "Core",
  },
  {
    id: "6",
    title: "Zapier Integration",
    description: "Connect Rapto with over 5,000 apps to automate your post-meeting workflows exactly how you want.",
    status: "planned",
    tag: "Integrations",
  },
];

const statuses = [
  {
    id: "shipped",
    label: "Shipped",
    icon: Rocket,
    color: "text-brand",
    bg: "bg-brand/10",
    border: "border-brand/20",
  },
  {
    id: "in-progress",
    label: "In Progress",
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-800",
  },
  {
    id: "planned",
    label: "Planned",
    icon: CheckCircle2,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    border: "border-blue-200 dark:border-blue-800",
  },
];

export function RoadmapBoard() {
  return (
    <section id="roadmap-board" className="py-24 bg-background">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {statuses.map((status) => (
            <div key={status.id} className="flex flex-col gap-6">
              {/* Column Header */}
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className={cn("p-2 rounded-lg", status.bg, status.color)}>
                  <status.icon className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-semibold text-foreground font-sans">
                  {status.label}
                </h3>
                <div className="ml-auto text-sm font-medium text-muted bg-surface py-1 px-3 rounded-full">
                  {roadmapItems.filter((item) => item.status === status.id).length}
                </div>
              </div>

              {/* Items List */}
              <div className="flex flex-col gap-4">
                {roadmapItems
                  .filter((item) => item.status === status.id)
                  .map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                      whileHover={{ y: -4, transition: { duration: 0.2 } }}
                      className="group relative p-6 bg-white dark:bg-surface-2 border border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <span className={cn(
                          "text-xs font-semibold px-2.5 py-1 rounded-md",
                          "bg-surface text-muted"
                        )}>
                          {item.tag}
                        </span>
                        {item.date && (
                          <span className="text-xs font-medium text-muted-subtle">
                            {item.date}
                          </span>
                        )}
                      </div>
                      <h4 className="text-lg font-semibold text-foreground mb-2 font-sans group-hover:text-brand transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-sm text-muted leading-relaxed font-sans">
                        {item.description}
                      </p>
                      
                      {/* Subtle interaction indicator */}
                      <div className="mt-6 flex items-center text-sm font-medium text-brand opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0 duration-200">
                        Learn more <ArrowRight className="w-4 h-4 ml-1" />
                      </div>
                    </motion.div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
