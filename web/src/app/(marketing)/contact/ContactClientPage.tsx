"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  MessageSquare,
  Check,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Users,
  HelpCircle,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  FileText,
  ExternalLink,
  Laptop,
  Briefcase,
  AlertTriangle
} from "lucide-react";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";
import { SkipLink } from "@/components/marketing/ui/SkipLink";
import { analytics, trackEvent } from "@/lib/analytics";

// Categories & configs
type CategoryId = "sales" | "support" | "partnership" | "general";

interface CategoryOption {
  id: CategoryId;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const CATEGORIES: CategoryOption[] = [
  {
    id: "sales",
    label: "Sales & Enterprise",
    description: "Request a custom demo, high-volume pricing, or contract details.",
    icon: Briefcase,
  },
  {
    id: "support",
    label: "Technical Support",
    description: "Get assistance with integrations, logins, or report issues.",
    icon: Laptop,
  },
  {
    id: "partnership",
    label: "Partnerships & Press",
    description: "Collaborations, marketing requests, or press inquiries.",
    icon: Users,
  },
  {
    id: "general",
    label: "General Inquiry",
    description: "Ask quick questions, share feedback, or just say hello.",
    icon: MessageSquare,
  },
];

// FAQS specifically for Contact / Sales / Security
const CONTACT_FAQS = [
  {
    question: "Do you offer custom NDAs or MSAs for enterprise customers?",
    answer: "Yes, for enterprise tier plans (minimum annual commitment), we can review and execute custom Non-Disclosure Agreements (NDAs), Master Services Agreements (MSAs), and Service Level Agreements (SLAs). Get in touch with our Sales category to start the compliance review process.",
  },
  {
    question: "Can we request custom integrations or on-premise deployments?",
    answer: "We offer native cloud-based integrations with Slack, Teams, Notion, and Jira. For enterprise customers with strict compliance constraints, we can discuss private tenant deployments on AWS, GCP, or custom webhook architectures. We do not support pure local on-premises installations as the transcription engine runs on distributed model clusters.",
  },
  {
    question: "How secure is our data? Is Vocaply SOC 2 compliant?",
    answer: "Security is built into our architecture. All meeting data is encrypted in transit via TLS 1.3 and at rest via AES-256. We do not use customer data or transcripts to train public AI models. We are currently SOC 2 Type I compliant, and our Type II audit period is active. We can share our latest SOC 2 report and security package with enterprise buyers under NDA.",
  },
  {
    question: "Can I book a live demonstration for my entire team?",
    answer: "Absolutely. Select the 'Sales & Enterprise' option in the contact form, and you will be presented with a link to schedule a direct video walkthrough with an AI Solutions Architect on our calendar. We'll show you how to connect your calendars and automatically track team commitments.",
  },
  {
    question: "What is your typical support response time?",
    answer: "For Technical Support, we operate 24/7 queue monitoring. Critical ticket categories receive responses within 2 hours under standard SLA. General support tickets are responded to in under 12 hours. Sales and partnership queries are routed immediately to the appropriate account manager and typically answered within one business day.",
  },
];

export function ContactClientPage() {
  const [category, setCategory] = useState<CategoryId>("sales");
  
  // Basic Form Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);

  // Sales-specific fields
  const [companySize, setCompanySize] = useState("");
  const [meetingVolume, setMeetingVolume] = useState("");

  // Support-specific fields
  const [priority, setPriority] = useState<"low" | "medium" | "critical">("medium");
  const [integration, setIntegration] = useState("general");

  // Form Submission Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(0); // 0: Idle, 1: Validating, 2: Encrypting, 3: Routing, 4: Done
  const [isSuccess, setIsSuccess] = useState(false);
  const [ticketRef, setTicketRef] = useState("");

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // FAQ state
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  // Live San Francisco Clock State
  const [mounted, setMounted] = useState(false);
  const [sfTime, setSfTime] = useState("");
  const [isOfficeOpen, setIsOfficeOpen] = useState(true);

  // Hydration safety: Start clock only on mount
  useEffect(() => {
    setMounted(true);
    
    const updateSfClock = () => {
      // Get current date/time in US/Pacific
      const options = {
        timeZone: "America/Los_Angeles",
        hour: "numeric" as const,
        minute: "2-digit" as const,
        hour12: true,
      };
      const timeStr = new Intl.DateTimeFormat("en-US", options).format(new Date());
      setSfTime(timeStr);

      // Determine office hours: 9 AM to 6 PM (9 to 18) Monday-Friday
      const sfDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
      const day = sfDate.getDay(); // 0 is Sunday, 6 is Saturday
      const hours = sfDate.getHours();
      
      const isOpen = day >= 1 && day <= 5 && hours >= 9 && hours < 18;
      setIsOfficeOpen(isOpen);
    };

    updateSfClock();
    const interval = setInterval(updateSfClock, 30000); // update every 30s
    return () => clearInterval(interval);
  }, []);

  // Validation logic
  const validateField = (fieldName: string, value: string) => {
    let err = "";
    if (fieldName === "name" && !value.trim()) {
      err = "Name is required.";
    } else if (fieldName === "email") {
      if (!value.trim()) {
        err = "Email is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        err = "Please enter a valid email address.";
      }
    } else if (fieldName === "message" && !value.trim()) {
      err = "Please describe how we can help you.";
    } else if (fieldName === "companySize" && category === "sales" && !value) {
      err = "Please select your organization size.";
    } else if (fieldName === "meetingVolume" && category === "sales" && !value) {
      err = "Please estimate your monthly meeting volume.";
    }
    return err;
  };

  const handleBlur = (fieldName: string, value: string) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
    const err = validateField(fieldName, value);
    setErrors((prev) => {
      if (err) return { ...prev, [fieldName]: err };
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  };

  // Full validation run on submit
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    const nameErr = validateField("name", name);
    if (nameErr) newErrors.name = nameErr;

    const emailErr = validateField("email", email);
    if (emailErr) newErrors.email = emailErr;

    const msgErr = validateField("message", message);
    if (msgErr) newErrors.message = msgErr;

    if (category === "sales") {
      const companyErr = validateField("companySize", companySize);
      if (companyErr) newErrors.companySize = companyErr;

      const volumeErr = validateField("meetingVolume", meetingVolume);
      if (volumeErr) newErrors.meetingVolume = volumeErr;
    }

    setErrors(newErrors);
    // Mark all as touched
    setTouched({
      name: true,
      email: true,
      message: true,
      companySize: true,
      meetingVolume: true,
    });

    return Object.keys(newErrors).length === 0;
  };

  // Switch category reset errors
  const handleCategoryChange = (newCat: CategoryId) => {
    setCategory(newCat);
    // Track category switch
    trackEvent("contact_category_change", { category: newCat });
    // Reset specific errors & touched
    setErrors({});
    setTouched({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      trackEvent("contact_form_validation_failed", { category });
      return;
    }

    setIsSubmitting(true);
    setSubmitStep(1);

    // Track analytics event
    trackEvent("contact_form_submit_start", { category });

    // Step-by-step submission simulator (1.8s total)
    const stepInterval = setInterval(() => {
      setSubmitStep((prev) => {
        if (prev < 3) return prev + 1;
        clearInterval(stepInterval);
        return 3;
      });
    }, 450);

    setTimeout(() => {
      // Create random ticket reference
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const randomLetters = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
      const randomNumber = Math.floor(1000 + Math.random() * 9000);
      const ticket = `VOC-${category.toUpperCase()}-${randomLetters}-${randomNumber}`;
      
      setTicketRef(ticket);
      setIsSuccess(true);
      setIsSubmitting(false);
      setSubmitStep(4);

      // Track successful submission
      trackEvent("contact_form_submit_success", { 
        category, 
        priority: category === "support" ? priority : undefined,
        ticket 
      });
    }, 1800);
  };

  const handleReset = () => {
    setName("");
    setEmail("");
    setMessage("");
    setCompanySize("");
    setMeetingVolume("");
    setPriority("medium");
    setIntegration("general");
    setIsSuccess(false);
    setErrors({});
    setTouched({});
    setSubmitStep(0);
  };

  const handleFaqToggle = (index: number) => {
    if (faqOpen === index) {
      setFaqOpen(null);
    } else {
      setFaqOpen(index);
      const question = CONTACT_FAQS[index]?.question;
      if (question) analytics.faqOpened(question);
    }
  };

  const springTransition = { type: "spring" as const, stiffness: 380, damping: 28 };

  return (
    <div className="relative min-h-screen bg-[#FAF9F5] text-[#0A0A0A] font-sans selection:bg-[#E8F5EE] selection:text-[#1A6B3C] overflow-hidden flex flex-col">
      {/* ── Background Glow Blobs ── */}
      <div className="absolute top-0 left-[10%] w-[500px] h-[500px] bg-gradient-to-br from-[#1A6B3C]/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-[30%] right-[-50px] w-[600px] h-[600px] bg-gradient-to-bl from-[#6ECC8E]/4 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[10%] left-[-100px] w-[500px] h-[500px] bg-gradient-to-tr from-[#1A6B3C]/3 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* ── Dotted Grid Overlay ── */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.25]"
        style={{
          backgroundImage: "radial-gradient(rgba(0, 0, 0, 0.05) 1.5px, transparent 1.5px)",
          backgroundSize: "24px 24px",
        }}
      />

      <SkipLink />
      <AnnouncementBar />
      <MarketingNav />

      <main id="main-content" className="flex-1 relative z-10">
        
        {/* ── Page Header ── */}
        <section className="px-6 pt-12 pb-6 md:pt-20 md:pb-10 max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#E8F5EE] border border-[#1A6B3C]/15 rounded-full mb-6 shadow-sm shadow-[#1A6B3C]/5"
          >
            <Sparkles size={12} className="text-[#1A6B3C] animate-pulse" />
            <span className="text-[10px] sm:text-xs font-bold text-[#1A6B3C] tracking-wider uppercase font-plus-jakarta">
              Connect With Us
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#0A0A0A] leading-[1.08] tracking-tight max-w-3xl mx-auto mb-5 font-normal"
          >
            Let&apos;s start a <span className="text-[#1A6B3C] italic font-serif">conversation.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-base sm:text-lg md:text-xl text-[#6B6A67] max-w-xl mx-auto leading-relaxed font-light"
          >
            Our team is here to answer your questions about billing, enterprise options, technical details, or general inquiries.
          </motion.p>
        </section>

        {/* ── Main Contact Container ── */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            
            {/* ── LEFT COLUMN: Info, Stats, Clock (5 cols) ── */}
            <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-24">
              
              {/* Direct email contacts card */}
              <div className="bg-white/80 backdrop-blur-md border border-[#E4E3DF] rounded-2xl p-6 shadow-sm">
                <h3 className="font-serif text-xl text-[#0A0A0A] mb-4 font-normal">
                  Contact channels
                </h3>
                <p className="text-xs text-[#6B6A67] mb-6 leading-relaxed">
                  Avoid the form entirely? You can drop us a line directly at these dedicated mailboxes.
                </p>

                <div className="space-y-4">
                  <a
                    href="mailto:support@vocaply.com"
                    className="flex items-center justify-between p-3 bg-[#FAF9F5] border border-black/5 hover:border-[#1A6B3C]/30 hover:bg-[#E8F5EE]/30 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white border border-[#E4E3DF] flex items-center justify-center text-[#6B6A67] group-hover:text-[#1A6B3C] group-hover:border-[#1A6B3C]/20 transition-all">
                        <Mail size={16} />
                      </div>
                      <div className="text-left">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[#9B9A96] block">
                          Technical Support
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0A0A0A]">
                          support@vocaply.com
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-[#9B9A96] group-hover:text-[#1A6B3C] group-hover:translate-x-1 transition-all" />
                  </a>

                  <a
                    href="mailto:sales@vocaply.com"
                    className="flex items-center justify-between p-3 bg-[#FAF9F5] border border-black/5 hover:border-[#1A6B3C]/30 hover:bg-[#E8F5EE]/30 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white border border-[#E4E3DF] flex items-center justify-center text-[#6B6A67] group-hover:text-[#1A6B3C] group-hover:border-[#1A6B3C]/20 transition-all">
                        <Briefcase size={16} />
                      </div>
                      <div className="text-left">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[#9B9A96] block">
                          Sales & Demos
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0A0A0A]">
                          sales@vocaply.com
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-[#9B9A96] group-hover:text-[#1A6B3C] group-hover:translate-x-1 transition-all" />
                  </a>
                </div>
              </div>

              {/* San Francisco Time Zone Widget */}
              <div className="bg-white/80 backdrop-blur-md border border-[#E4E3DF] rounded-2xl p-6 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-serif text-xl text-[#0A0A0A] font-normal">
                      Headquarters
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#6B6A67] mt-1 font-medium">
                      <MapPin size={12} className="text-[#1A6B3C]" />
                      <span>San Francisco, CA</span>
                    </div>
                  </div>
                  
                  {/* Status Indicator Badge */}
                  {mounted && (
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase py-1 px-3 rounded-full ${
                        isOfficeOpen
                          ? "bg-[#E8F5EE] text-[#1A6B3C]"
                          : "bg-[#FAF2EE] text-[#C84B31]"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isOfficeOpen ? "bg-[#22c55e]" : "bg-[#ef4444]"} animate-pulse`} />
                      {isOfficeOpen ? "We are online" : "Support queue active"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 bg-[#FAF9F5] border border-black/5 p-4 rounded-xl">
                  <Clock size={24} className="text-[#1A6B3C]" />
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#9B9A96] block">
                      Local Time (PST/PDT)
                    </span>
                    <span className="text-xl font-bold font-plus-jakarta text-[#0A0A0A] min-h-[28px] block">
                      {mounted ? sfTime : "--:-- --"}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-[#6B6A67] mt-4 leading-relaxed">
                  {isOfficeOpen 
                    ? "Our primary business and solution architecture teams are currently active. You can expect a response within minutes."
                    : "Office is closed (regular hours: 9 AM - 6 PM PST, M-F). However, our global 24/7 technical team is online monitoring critical issues."}
                </p>
              </div>

              {/* Statistics/Trust Indicators */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/80 backdrop-blur-md border border-[#E4E3DF] rounded-2xl p-5 shadow-sm text-center">
                  <span className="font-serif text-3xl md:text-4xl text-[#1A6B3C] block font-normal">
                    &lt; 30m
                  </span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-[#9B9A96] mt-2 block">
                    Avg Response Time
                  </span>
                </div>
                <div className="bg-white/80 backdrop-blur-md border border-[#E4E3DF] rounded-2xl p-5 shadow-sm text-center">
                  <span className="font-serif text-3xl md:text-4xl text-[#1A6B3C] block font-normal">
                    99.4%
                  </span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-[#9B9A96] mt-2 block">
                    CSAT Satisfaction
                  </span>
                </div>
              </div>

              {/* Security Banner redirect */}
              <div className="bg-gradient-to-br from-[#0F1E15] to-[#0A0A0A] text-white rounded-2xl p-6 border border-white/10 shadow-md flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-[#6ECC8E]">
                    <ShieldCheck size={12} />
                    Enterprise Grade Security
                  </span>
                  <h4 className="font-serif text-base font-normal">
                    Data Compliance & SOC 2
                  </h4>
                  <p className="text-[11px] text-white/60 leading-relaxed max-w-[240px]">
                    Read how we isolate meeting recordings, encrypt tokens, and secure your organizational metadata.
                  </p>
                </div>
                <Link
                  href="/security"
                  className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white hover:text-black transition-all"
                  aria-label="Read our security statement"
                >
                  <ExternalLink size={16} />
                </Link>
              </div>

            </div>

            {/* ── RIGHT COLUMN: Interactive Card Form (7 cols) ── */}
            <div className="lg:col-span-7">
              <div className="bg-white border border-[#E4E3DF] rounded-2xl shadow-md p-6 sm:p-8 relative overflow-hidden">
                
                {/* Submit Loading overlay screen */}
                <AnimatePresence>
                  {isSubmitting && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-center"
                    >
                      <Loader2 className="w-10 h-10 text-[#1A6B3C] animate-spin mb-6" />
                      
                      <div className="h-8 relative overflow-hidden w-64 flex justify-center mb-1">
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={submitStep}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="absolute font-serif text-lg text-[#0A0A0A]"
                          >
                            {submitStep === 1 && "Validating message details..."}
                            {submitStep === 2 && "Securing transmission payload..."}
                            {submitStep === 3 && "Routing to support agents..."}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                      <p className="text-xs text-[#9B9A96]">Please don&apos;t close this page</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Success Screen */}
                {isSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-8"
                  >
                    <div className="w-16 h-16 bg-[#E8F5EE] text-[#1A6B3C] rounded-full flex items-center justify-center mx-auto mb-6 border border-[#1A6B3C]/10 shadow-sm">
                      <CheckCircle2 size={32} />
                    </div>

                    <h3 className="font-serif text-2xl sm:text-3xl text-[#0A0A0A] mb-3 font-normal">
                      Message Received!
                    </h3>
                    <p className="text-sm text-[#6B6A67] max-w-md mx-auto mb-6 leading-relaxed">
                      We have received your request and opened a ticket for your team. You should receive a receipt email shortly.
                    </p>

                    {/* Ticket Reference Block */}
                    <div className="bg-[#FAF9F5] border border-[#E4E3DF] rounded-xl p-4 max-w-sm mx-auto mb-8 text-left">
                      <div className="flex justify-between items-center mb-2 border-b border-black/5 pb-2 text-[10px] uppercase font-bold text-[#9B9A96]">
                        <span>Reference Details</span>
                        <span className="text-[#1A6B3C]">Active ticket</span>
                      </div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-[#6B6A67]">Ticket ID:</span>
                        <strong className="font-mono text-[#0A0A0A]">{ticketRef}</strong>
                      </div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-[#6B6A67]">Category:</span>
                        <strong className="text-[#0A0A0A] uppercase tracking-wider text-[10px]">{category}</strong>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#6B6A67]">Est. Response:</span>
                        <strong className="text-[#1A6B3C] font-semibold">
                          {category === "sales" ? "Within 2-4 hours" : category === "support" && priority === "critical" ? "Within 60-90 minutes" : "Under 8 hours"}
                        </strong>
                      </div>
                    </div>

                    <button
                      onClick={handleReset}
                      className="px-6 py-3 bg-[#0A0A0A] hover:bg-[#1A6B3C] text-white text-xs font-semibold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow active:scale-98"
                    >
                      Send another message
                    </button>
                  </motion.div>
                ) : (
                  // Form Screen
                  <form onSubmit={handleSubmit} className="space-y-6">
                    
                    {/* Category Selector Title */}
                    <div>
                      <span className="text-[10px] uppercase tracking-widest font-bold text-[#9B9A96] block mb-3">
                        What is this regarding?
                      </span>
                      
                      {/* Grid Category selector */}
                      <div className="grid grid-cols-2 gap-3">
                        {CATEGORIES.map((opt) => {
                          const Icon = opt.icon;
                          const active = category === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleCategoryChange(opt.id)}
                              className={`p-4 border rounded-xl text-left transition-all relative flex flex-col justify-between min-h-[92px] cursor-pointer group ${
                                active
                                  ? "bg-[#FAF9F5] border-[#1A6B3C] shadow-sm shadow-[#1A6B3C]/5"
                                  : "bg-white border-[#E4E3DF] hover:border-[#D0CFC9] hover:bg-[#FAF9F5]/30"
                              }`}
                            >
                              {active && (
                                <span className="absolute top-3 right-3 w-4 h-4 rounded-full bg-[#1A6B3C] text-white flex items-center justify-center">
                                  <Check size={10} strokeWidth={3} />
                                </span>
                              )}
                              
                              <Icon 
                                size={18} 
                                className={active ? "text-[#1A6B3C]" : "text-[#9B9A96] group-hover:text-[#6B6A67] transition-all"} 
                              />
                              
                              <div className="mt-3">
                                <span className={`text-[11px] font-bold tracking-tight block ${
                                  active ? "text-[#1A6B3C]" : "text-[#0A0A0A]"
                                }`}>
                                  {opt.label}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="mt-3 min-h-[32px] px-1">
                        <p className="text-[11px] text-[#6B6A67] leading-relaxed">
                          {CATEGORIES.find((c) => c.id === category)?.description}
                        </p>
                      </div>
                    </div>

                    <div className="h-[1px] bg-[#E4E3DF]" />

                    {/* Standard Contact Fields Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      
                      {/* Full Name */}
                      <div className="space-y-1.5">
                        <label htmlFor="name-input" className="text-[10px] uppercase tracking-wider font-bold text-[#6B6A67]">
                          Your Name
                        </label>
                        <input
                          id="name-input"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          onBlur={(e) => handleBlur("name", e.target.value)}
                          placeholder="Uzair Khan"
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-[13px] bg-white transition-all outline-none ${
                            errors.name && touched.name
                              ? "border-[#C84B31] bg-[#FDECEA]/10 focus:border-[#C84B31]"
                              : "border-[#E4E3DF] focus:border-[#1A6B3C]"
                          }`}
                        />
                        <AnimatePresence>
                          {errors.name && touched.name && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex items-center gap-1 text-[10px] text-[#C84B31] font-semibold mt-0.5"
                            >
                              <AlertCircle size={10} />
                              <span>{errors.name}</span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Email Address */}
                      <div className="space-y-1.5">
                        <label htmlFor="email-input" className="text-[10px] uppercase tracking-wider font-bold text-[#6B6A67]">
                          Email Address
                        </label>
                        <input
                          id="email-input"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onBlur={(e) => handleBlur("email", e.target.value)}
                          placeholder="uzair@example.com"
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-[13px] bg-white transition-all outline-none ${
                            errors.email && touched.email
                              ? "border-[#C84B31] bg-[#FDECEA]/10 focus:border-[#C84B31]"
                              : "border-[#E4E3DF] focus:border-[#1A6B3C]"
                          }`}
                        />
                        <AnimatePresence>
                          {errors.email && touched.email && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex items-center gap-1 text-[10px] text-[#C84B31] font-semibold mt-0.5"
                            >
                              <AlertCircle size={10} />
                              <span>{errors.email}</span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                    </div>

                    {/* DYNAMIC FIELDS - SALES & ENTERPRISE */}
                    <AnimatePresence mode="wait">
                      {category === "sales" && (
                        <motion.div
                          key="sales-fields"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2"
                        >
                          {/* Organization Size */}
                          <div className="space-y-1.5">
                            <label htmlFor="company-size-select" className="text-[10px] uppercase tracking-wider font-bold text-[#6B6A67]">
                              Organization Size
                            </label>
                            <select
                              id="company-size-select"
                              value={companySize}
                              onChange={(e) => setCompanySize(e.target.value)}
                              onBlur={(e) => handleBlur("companySize", e.target.value)}
                              className={`w-full px-3.5 py-2.5 rounded-xl border text-[13px] bg-white transition-all outline-none appearance-none cursor-pointer ${
                                errors.companySize && touched.companySize
                                  ? "border-[#C84B31] bg-[#FDECEA]/10"
                                  : "border-[#E4E3DF] focus:border-[#1A6B3C]"
                              }`}
                            >
                              <option value="">Select size...</option>
                              <option value="1-10">1 - 10 employees</option>
                              <option value="11-50">11 - 50 employees</option>
                              <option value="51-200">51 - 200 employees</option>
                              <option value="201-1000">201 - 1000 employees</option>
                              <option value="1000+">1000+ employees</option>
                            </select>
                            <AnimatePresence>
                              {errors.companySize && touched.companySize && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="flex items-center gap-1 text-[10px] text-[#C84B31] font-semibold mt-0.5"
                                >
                                  <AlertCircle size={10} />
                                  <span>{errors.companySize}</span>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Meeting Volume */}
                          <div className="space-y-1.5">
                            <label htmlFor="meeting-volume-select" className="text-[10px] uppercase tracking-wider font-bold text-[#6B6A67]">
                              Monthly Meeting Volume
                            </label>
                            <select
                              id="meeting-volume-select"
                              value={meetingVolume}
                              onChange={(e) => setMeetingVolume(e.target.value)}
                              onBlur={(e) => handleBlur("meetingVolume", e.target.value)}
                              className={`w-full px-3.5 py-2.5 rounded-xl border text-[13px] bg-white transition-all outline-none appearance-none cursor-pointer ${
                                errors.meetingVolume && touched.meetingVolume
                                  ? "border-[#C84B31] bg-[#FDECEA]/10"
                                  : "border-[#E4E3DF] focus:border-[#1A6B3C]"
                              }`}
                            >
                              <option value="">Estimate meetings...</option>
                              <option value="0-20">0 - 20 meetings / mo</option>
                              <option value="21-100">21 - 100 meetings / mo</option>
                              <option value="101-500">101 - 500 meetings / mo</option>
                              <option value="500+">500+ meetings / mo</option>
                            </select>
                            <AnimatePresence>
                              {errors.meetingVolume && touched.meetingVolume && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="flex items-center gap-1 text-[10px] text-[#C84B31] font-semibold mt-0.5"
                                >
                                  <AlertCircle size={10} />
                                  <span>{errors.meetingVolume}</span>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}

                      {/* DYNAMIC FIELDS - TECHNICAL SUPPORT */}
                      {category === "support" && (
                        <motion.div
                          key="support-fields"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2"
                        >
                          {/* Priority Selector */}
                          <div className="space-y-1.5">
                            <label htmlFor="priority-select" className="text-[10px] uppercase tracking-wider font-bold text-[#6B6A67]">
                              Ticket Priority
                            </label>
                            <div className="flex gap-2 bg-[#FAF9F5] p-1 border border-[#E4E3DF] rounded-xl">
                              {(["low", "medium", "critical"] as const).map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setPriority(p)}
                                  className={`flex-1 py-1.5 text-center text-[11px] font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                                    priority === p
                                      ? p === "critical"
                                        ? "bg-[#C84B31] text-white"
                                        : "bg-[#1A6B3C] text-white"
                                      : "text-[#6B6A67] hover:text-[#0A0A0A]"
                                  }`}
                                >
                                  {p}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Primary Integration */}
                          <div className="space-y-1.5">
                            <label htmlFor="integration-select" className="text-[10px] uppercase tracking-wider font-bold text-[#6B6A67]">
                              Affected Integration
                            </label>
                            <select
                              id="integration-select"
                              value={integration}
                              onChange={(e) => setIntegration(e.target.value)}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4E3DF] focus:border-[#1A6B3C] text-[13px] bg-white transition-all outline-none cursor-pointer"
                            >
                              <option value="general">None / General App Issue</option>
                              <option value="slack">Slack Bot</option>
                              <option value="jira">Jira Ticket Syncer</option>
                              <option value="teams">Microsoft Teams</option>
                              <option value="calendar">Google Calendar / Outlook Sync</option>
                              <option value="api">Custom API / Webhooks</option>
                            </select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Support Warning Banner for Critical Support */}
                    <AnimatePresence>
                      {category === "support" && priority === "critical" && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className="bg-[#FDECEA] border border-[#C84B31]/30 p-3.5 rounded-xl flex items-start gap-2.5"
                        >
                          <AlertTriangle size={15} className="text-[#C84B31] flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-[#C84B31] leading-relaxed">
                            <strong>Critical priority</strong> routes this ticket to our emergency on-call engineer. Please use this option only for service interruptions or critical security incidents.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Detailed Message */}
                    <div className="space-y-1.5">
                      <label htmlFor="message-textarea" className="text-[10px] uppercase tracking-wider font-bold text-[#6B6A67]">
                        {category === "sales" 
                          ? "What details can you share about your team&apos;s requirements?"
                          : category === "support"
                          ? "Please describe the technical problem you are experiencing"
                          : "Your Message"}
                      </label>
                      <textarea
                        id="message-textarea"
                        rows={5}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onBlur={(e) => handleBlur("message", e.target.value)}
                        placeholder={
                          category === "sales"
                            ? "Tell us about your weekly meeting load, key workflow sync challenges, or security reviews you need."
                            : category === "support"
                            ? "Include steps to reproduce, workspace name, or error logs if possible."
                            : "Write your message here..."
                        }
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-[13px] bg-white transition-all outline-none resize-y min-h-[120px] ${
                          errors.message && touched.message
                            ? "border-[#C84B31] bg-[#FDECEA]/10 focus:border-[#C84B31]"
                            : "border-[#E4E3DF] focus:border-[#1A6B3C]"
                        }`}
                      />
                      <AnimatePresence>
                        {errors.message && touched.message && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-1 text-[10px] text-[#C84B31] font-semibold mt-0.5"
                          >
                            <AlertCircle size={10} />
                            <span>{errors.message}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Marketing Consent */}
                    <div className="flex items-start gap-2.5">
                      <input
                        id="consent-checkbox"
                        type="checkbox"
                        checked={marketingConsent}
                        onChange={(e) => setMarketingConsent(e.target.checked)}
                        className="mt-1 accent-[#1A6B3C] cursor-pointer"
                      />
                      <label htmlFor="consent-checkbox" className="text-[11px] text-[#6B6A67] leading-relaxed cursor-pointer select-none">
                        Receive product updates, compliance tips, and feature announcements from Vocaply. Unsubscribe at any time.
                      </label>
                    </div>

                    {/* Action button */}
                    <button
                      type="submit"
                      className="w-full py-3.5 bg-[#0A0A0A] hover:bg-[#1A6B3C] text-white text-xs font-semibold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow hover:shadow-lg active:scale-98"
                    >
                      <span>Send secure message</span>
                      <Send size={12} />
                    </button>
                  </form>
                )}

              </div>
            </div>

          </div>
        </section>

        {/* ── FAQ Section (Deflection) ── */}
        <section className="bg-white/40 border-t border-[#E4E3DF] py-24 px-6 relative">
          <div className="max-w-4xl mx-auto relative z-10">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FAF9F5] border border-[#E4E3DF] rounded-full mb-4">
                <HelpCircle size={12} className="text-[#6B6A67]" />
                <span className="text-[10px] font-bold text-[#6B6A67] tracking-wider uppercase font-plus-jakarta">
                  Got Questions?
                </span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl text-[#0A0A0A] mb-4 font-normal tracking-tight">
                Frequently asked questions
              </h2>
              <p className="text-sm text-[#6B6A67] max-w-lg mx-auto leading-relaxed">
                Before sending a ticket, see if your question is answered below.
              </p>
            </div>

            {/* FAQS Accordion list */}
            <div className="space-y-4 max-w-3xl mx-auto">
              {CONTACT_FAQS.map((faq, i) => {
                const isOpen = faqOpen === i;
                return (
                  <div
                    key={i}
                    className="bg-white border border-[#E4E3DF] rounded-xl overflow-hidden shadow-sm transition-all"
                  >
                    <button
                      onClick={() => handleFaqToggle(i)}
                      className="w-full px-6 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-[#FAF9F5]/50 transition-colors"
                      type="button"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-semibold text-[#0A0A0A] pr-4">
                        {faq.question}
                      </span>
                      {isOpen ? (
                        <ChevronUp size={16} className="text-[#1A6B3C] flex-shrink-0" />
                      ) : (
                        <ChevronDown size={16} className="text-[#6B6A67] flex-shrink-0" />
                      )}
                    </button>
                    
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                        >
                          <div className="px-6 pb-5 pt-1 text-[13px] text-[#6B6A67] leading-relaxed border-t border-black/5">
                            {faq.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      </main>

      <MarketingFooter />
      <MobileCTABar />
    </div>
  );
}
