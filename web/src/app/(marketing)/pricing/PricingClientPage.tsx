"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  Calculator,
  ShieldCheck,
  Zap,
  Sparkles,
  HelpCircle,
  TrendingUp,
  DollarSign,
  Info,
  Layers,
  ArrowRight,
  Plus,
  Minus,
} from "lucide-react";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";
import { SkipLink } from "@/components/marketing/ui/SkipLink";
import { openWaitlistModal } from "@/hooks/marketing/useWaitlistModal";
import { pricingPlans } from "@/lib/marketing/content/pricing.content";
import { analytics, trackEvent } from "@/lib/analytics";
import { CustomerLogos } from "@/components/marketing/sections/CustomerLogos";

// FAQ Items specifically for pricing
const pricingFaqs = [
  {
    question: "Why flat team pricing instead of per-seat?",
    answer: "Traditional SaaS per-seat pricing creates 'seat anxiety' — managers hesitate to invite teammates to avoid cost bumps, which hurts team adoption. Our infrastructure costs are driven by meeting hours processed (recall.ai bots + AI extraction tokens), not by how many people view the results. Flat team pricing allows you to add your entire team without worrying about billing fluctuations.",
  },
  {
    question: "What happens if we exceed our plan's monthly meeting limit?",
    answer: "If you hit your meeting limit, we won't abruptly shut off your service. We offer overage packs (+20 meetings for $15, or +50 meetings for $30) to cover temporary high-use periods. Alternatively, you can easily upgrade to the next tier at a prorated rate.",
  },
  {
    question: "Do you require a credit card for the free trial?",
    answer: "No. All paid plans come with a 14-day free trial, and no credit card is required to sign up. You can experience the full power of Rapto risk-free.",
  },
  {
    question: "Can we cancel or change plans at any time?",
    answer: "Yes, absolutely. You can upgrade, downgrade, or cancel your plan at any time from your billing settings. If you upgrade, the change is applied immediately and prorated. If you downgrade or cancel, you will retain access until the end of your current billing period.",
  },
  {
    question: "What happens to our meeting data if we cancel?",
    answer: "You own all your data. Before cancelling, you can export all transcripts, summaries, and commitment history as CSV or Markdown files. Once your subscription ends, your data is retained securely for 30 days before being permanently deleted from our servers.",
  },
  {
    question: "Is our meeting data used to train AI models?",
    answer: "No. Your meeting transcripts, summaries, and commitments are strictly private to your team. We do not use your data, or any transcripts processed by our system, to train underlying AI models. We secure all data in transit via TLS 1.3 and at rest via AES-256 encryption.",
  },
];

export function PricingClientPage() {
  const [isAnnual, setIsAnnual] = useState(true);
  const [showMatrix, setShowMatrix] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0); // First FAQ open by default

  // ROI Calculator States
  const [calcMembers, setCalcMembers] = useState(15);
  const [calcMeetings, setCalcMeetings] = useState(60);
  const [calcHourlyRate, setCalcHourlyRate] = useState(80);
  const [showTransparency, setShowTransparency] = useState(false);

  const toggleBilling = () => {
    setIsAnnual(!isAnnual);
    analytics.pricingToggle(!isAnnual ? "annual" : "monthly");
  };

  const handleIncrement = (val: number, setVal: (v: number) => void, max: number, step = 1) => {
    setVal(Math.min(max, val + step));
  };

  const handleDecrement = (val: number, setVal: (v: number) => void, min: number, step = 1) => {
    setVal(Math.max(min, val - step));
  };

  // ROI Calculations
  const calculatorResults = useMemo(() => {
    // Determine recommended plan based on members and meetings
    let recommendedPlan = "Free";
    let basePrice = 0;
    let limitWarning = "";

    if (calcMembers <= 3 && calcMeetings <= 5) {
      recommendedPlan = "Free";
      basePrice = 0;
    } else if (calcMembers <= 10 && calcMeetings <= 40) {
      recommendedPlan = "Starter";
      basePrice = isAnnual ? 39 : 49;
    } else if (calcMembers <= 25 && calcMeetings <= 120) {
      recommendedPlan = "Growth";
      basePrice = isAnnual ? 79 : 99;
    } else if (calcMembers <= 60 && calcMeetings <= 300) {
      recommendedPlan = "Business";
      basePrice = isAnnual ? 159 : 199;
    } else {
      recommendedPlan = "Enterprise";
      basePrice = 500; // base starting price
      limitWarning = "Enterprise plan recommended due to scaling requirements.";
    }

    // Competitor per-seat cost (e.g. Otter or Fireflies at $15/user/month avg)
    const competitorCost = calcMembers * 15;
    const monthlySavings = competitorCost - basePrice;
    
    // Time saved: estimated 15 minutes (0.25h) saved per meeting in admin time (transcribing, tracking tasks, writing Jira tickets, chasing follow-ups)
    const hoursSaved = Math.round(calcMeetings * 0.25);
    const financialRoi = hoursSaved * calcHourlyRate;
    const netSavings = financialRoi - basePrice;

    // Transparency Breakdown (Cost to serve)
    const recallCost = calcMeetings * 0.35; // $0.35/meeting avg
    const claudeCost = calcMeetings * 0.03; // $0.03/meeting avg
    const totalInfraCost = recallCost + claudeCost + 2.0; // Amortized fixed costs per team
    const markupFactor = basePrice > 0 ? (basePrice / totalInfraCost).toFixed(1) : "0";

    return {
      recommendedPlan,
      basePrice,
      competitorCost,
      monthlySavings,
      hoursSaved,
      financialRoi,
      netSavings,
      recallCost,
      claudeCost,
      totalInfraCost,
      markupFactor,
      limitWarning,
    };
  }, [calcMembers, calcMeetings, calcHourlyRate, isAnnual]);

  const toggleFaq = (index: number) => {
    if (faqOpen === index) {
      setFaqOpen(null);
    } else {
      setFaqOpen(index);
      const question = pricingFaqs[index]?.question;
      if (question) analytics.faqOpened(question);
    }
  };

  // Stacked bar width calculation helper
  const transparencyWeights = useMemo(() => {
    const baseVal = calculatorResults.basePrice > 0 ? calculatorResults.basePrice : calculatorResults.totalInfraCost;
    const recallW = (calculatorResults.recallCost / baseVal) * 100;
    const claudeW = (calculatorResults.claudeCost / baseVal) * 100;
    const infraW = (2.0 / baseVal) * 100;
    const marginW = calculatorResults.basePrice > calculatorResults.totalInfraCost
      ? ((calculatorResults.basePrice - calculatorResults.totalInfraCost) / baseVal) * 100
      : 0;
    
    return {
      recall: recallW,
      claude: claudeW,
      infra: infraW,
      margin: marginW
    };
  }, [calculatorResults]);

  // Framer Motion spring configs
  const springTransition = { type: "spring" as const, stiffness: 350, damping: 25 };

  return (
    <div className="relative min-h-screen bg-[#FAF9F5] text-[#0A0A0A] font-sans selection:bg-[#E8F5EE] selection:text-[#1A6B3C] overflow-hidden flex flex-col">
      {/* ── Background Glow Blobs ── */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-[#1A6B3C]/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-[20%] right-0 w-[600px] h-[600px] bg-gradient-to-bl from-[#6ECC8E]/4 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[20%] left-[-100px] w-[500px] h-[500px] bg-gradient-to-tr from-[#1A6B3C]/3 to-transparent rounded-full blur-3xl pointer-events-none" />
      
      {/* ── Dotted Grid Overlay ── */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.3]"
        style={{
          backgroundImage: "radial-gradient(rgba(0, 0, 0, 0.05) 1.5px, transparent 1.5px)",
          backgroundSize: "24px 24px",
        }}
      />

      <SkipLink />
      <AnnouncementBar />
      <MarketingNav />

      <main id="main-content" className="flex-1 relative z-10">
        {/* ── HERO SECTION ── */}
        <section className="px-6 pt-16 pb-12 md:pt-24 md:pb-16 text-center max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#E8F5EE] border border-[#1A6B3C]/15 rounded-full mb-6 shadow-sm shadow-[#1A6B3C]/5"
          >
            <Sparkles size={12} className="text-[#1A6B3C] animate-pulse" />
            <span className="text-[10px] sm:text-xs font-bold text-[#1A6B3C] tracking-wider uppercase font-plus-jakarta">
              Flat Team Billing
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#0A0A0A] leading-[1.08] tracking-tight max-w-3xl mx-auto mb-6 font-normal"
          >
            Simple pricing. <br />
            <span className="text-[#1A6B3C] italic font-serif">One flat price per team.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-base sm:text-lg md:text-xl text-[#6B6A67] max-w-xl mx-auto mb-10 leading-relaxed font-light"
          >
            No per-seat anxiety. Invite your entire cross-functional team freely. Rapto&apos;s cost is driven by meetings, not people.
          </motion.p>

          {/* Billing Switcher */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="inline-flex items-center gap-3 relative bg-[#E4E3DF] p-1.5 rounded-full shadow-inner border border-black/5"
          >
            <button
              onClick={() => isAnnual && toggleBilling()}
              className={`relative z-10 px-6 py-2.5 rounded-full font-sans text-xs font-semibold tracking-wide uppercase transition-colors duration-300 cursor-pointer ${
                !isAnnual ? "text-[#0A0A0A]" : "text-[#6B6A67] hover:text-[#0A0A0A]"
              }`}
            >
              {!isAnnual && (
                <motion.div
                  layoutId="billing-pill"
                  className="absolute inset-0 bg-white rounded-full shadow-md z-[-1]"
                  transition={springTransition}
                />
              )}
              Monthly
            </button>
            <button
              onClick={() => !isAnnual && toggleBilling()}
              className={`relative z-10 px-6 py-2.5 rounded-full font-sans text-xs font-semibold tracking-wide uppercase transition-colors duration-300 cursor-pointer flex items-center gap-1.5 ${
                isAnnual ? "text-[#0A0A0A]" : "text-[#6B6A67] hover:text-[#0A0A0A]"
              }`}
            >
              {isAnnual && (
                <motion.div
                  layoutId="billing-pill"
                  className="absolute inset-0 bg-white rounded-full shadow-md z-[-1]"
                  transition={springTransition}
                />
              )}
              Annually
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors duration-300 ${
                  isAnnual ? "bg-[#E8F5EE] text-[#1A6B3C]" : "bg-black/5 text-[#9B9A96]"
                }`}
              >
                Save 20%
              </span>
            </button>
          </motion.div>
        </section>

        {/* ── PRICING CARDS GRID ── */}
        <section className="px-6 pb-20 max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.1,
                  delayChildren: 0.2
                }
              }
            }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch"
          >
            {pricingPlans.map((plan) => {
              const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
              const isFree = plan.monthlyPrice === 0;
              const isPopular = plan.isPopular;

              return (
                <motion.div
                  key={plan.name}
                  variants={{
                    hidden: { opacity: 0, y: 30 },
                    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 15 } }
                  }}
                  whileHover={{ y: -6, transition: { duration: 0.2 } }}
                  className={`relative flex flex-col rounded-2xl p-8 transition-all duration-300 group ${
                    isPopular
                      ? "bg-gradient-to-br from-[#0D1D14] via-[#0A0A0A] to-[#0A0A0A] text-white shadow-xl shadow-[#1A6B3C]/10 border border-[#1A6B3C]/40 z-10 md:scale-[1.03]"
                      : "bg-white/80 backdrop-blur-md border border-[#E4E3DF] text-[#0A0A0A] shadow-sm hover:shadow-md hover:border-[#E4E3DF]/100"
                  }`}
                >
                  {isPopular && (
                    <>
                      <div className="absolute inset-0 -z-10 bg-[#1A6B3C]/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#1A6B3C] text-white text-[9px] font-bold tracking-widest uppercase py-1.5 px-4 rounded-full flex items-center gap-1.5 shadow-md shadow-[#1A6B3C]/35">
                        <Zap size={9} strokeWidth={3} className="fill-white" />
                        Most Popular
                      </div>
                    </>
                  )}

                  {/* Plan header */}
                  <h3 className={`text-xs font-bold uppercase tracking-widest mb-6 ${
                    isPopular ? "text-white/60" : "text-[#9B9A96]"
                  }`}>
                    {plan.name}
                  </h3>

                  {/* Price info */}
                  <div className="flex items-baseline gap-0.5 mb-2">
                    {!isFree && (
                      <span className={`text-xl font-normal font-sans ${isPopular ? "text-white/70" : "text-[#6B6A67]"}`}>
                        $
                      </span>
                    )}
                    <span className="font-serif text-5xl tracking-tight leading-none">
                      {isFree ? "Free" : price}
                    </span>
                    {!isFree && (
                      <span className={`text-xs font-sans ml-1 ${isPopular ? "text-white/50" : "text-[#9B9A96]"}`}>
                        / month
                      </span>
                    )}
                  </div>

                  {/* Billed As note */}
                  <div className="min-h-[20px] mb-6">
                    {isAnnual && !isFree ? (
                      <p className={`text-[11px] font-semibold ${isPopular ? "text-[#6ECC8E]" : "text-[#1A6B3C]"}`}>
                        Billed as ${plan.annualBilledAs}/year (Save 20%)
                      </p>
                    ) : isFree ? (
                      <p className="text-[11px] text-[#9B9A96]">
                        No credit card required
                      </p>
                    ) : null}
                  </div>

                  <div className={`h-[1px] w-full mb-6 ${isPopular ? "bg-white/10" : "bg-[#E4E3DF]"}`} />

                  {/* Limits visual indicators */}
                  <div className="space-y-4 mb-6">
                    {/* Members Limit */}
                    <div className={`p-3.5 rounded-xl border ${
                      isPopular 
                        ? "bg-white/5 border-white/5" 
                        : "bg-[#FAF9F5] border-black/5"
                    }`}>
                      <div className="flex justify-between text-[11px] mb-2 font-medium">
                        <span className="flex items-center gap-1.5 opacity-80">
                          <Users size={12} />
                          Members
                        </span>
                        <span className={`font-bold ${isPopular ? "text-[#6ECC8E]" : "text-[#1A6B3C]"}`}>
                          {plan.name === "Free" ? "3" : plan.name === "Starter" ? "10" : plan.name === "Growth" ? "25" : "60"}
                        </span>
                      </div>
                      <div className={`w-full h-1.5 rounded-full overflow-hidden ${isPopular ? "bg-white/10" : "bg-black/5"}`}>
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: plan.name === "Free" ? "25%" : plan.name === "Starter" ? "50%" : plan.name === "Growth" ? "75%" : "100%" }}
                          transition={{ duration: 0.8, delay: 0.2 }}
                          className={`h-full rounded-full ${isPopular ? "bg-[#6ECC8E]" : "bg-[#1A6B3C]"}`}
                        />
                      </div>
                    </div>

                    {/* Meetings Limit */}
                    <div className={`p-3.5 rounded-xl border ${
                      isPopular 
                        ? "bg-white/5 border-white/5" 
                        : "bg-[#FAF9F5] border-black/5"
                    }`}>
                      <div className="flex justify-between text-[11px] mb-2 font-medium">
                        <span className="flex items-center gap-1.5 opacity-80">
                          <Clock size={12} />
                          Meetings / mo
                        </span>
                        <span className={`font-bold ${isPopular ? "text-[#6ECC8E]" : "text-[#1A6B3C]"}`}>
                          {plan.name === "Free" ? "5" : plan.name === "Starter" ? "40" : plan.name === "Growth" ? "120" : "300"}
                        </span>
                      </div>
                      <div className={`w-full h-1.5 rounded-full overflow-hidden ${isPopular ? "bg-white/10" : "bg-black/5"}`}>
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: plan.name === "Free" ? "15%" : plan.name === "Starter" ? "40%" : plan.name === "Growth" ? "75%" : "100%" }}
                          transition={{ duration: 0.8, delay: 0.3 }}
                          className={`h-full rounded-full ${isPopular ? "bg-[#6ECC8E]" : "bg-[#1A6B3C]"}`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 px-1 text-xs opacity-75">
                      <Layers size={13} />
                      <span>{plan.historyLimit}</span>
                    </div>
                  </div>

                  <div className={`h-[1px] w-full mb-6 ${isPopular ? "bg-white/10" : "bg-[#E4E3DF]"}`} />

                  {/* Feature list */}
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex gap-2.5 items-start text-xs sm:text-[13px] leading-relaxed">
                        <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center mt-0.5 ${
                          isPopular ? "bg-[#6ECC8E]/10 text-[#6ECC8E]" : "bg-[#E8F5EE] text-[#1A6B3C]"
                        }`}>
                          <Check size={10} strokeWidth={3} />
                        </span>
                        <span className={isPopular ? "text-white/80" : "text-[#6B6A67]"}>
                          {feat}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Action button */}
                  <button
                    onClick={() => {
                      analytics.pricingPlanClick(plan.name.toLowerCase() as any);
                      openWaitlistModal();
                    }}
                    className={`w-full py-3.5 px-5 rounded-xl font-sans text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:shadow active:scale-98 ${
                      isPopular
                        ? "bg-[#1A6B3C] text-white hover:bg-[#2D8A50] hover:shadow-[#1A6B3C]/10 border border-[#2D8A50]"
                        : "bg-transparent text-[#1A6B3C] border border-[#1A6B3C] hover:bg-[#1A6B3C] hover:text-white"
                    }`}
                  >
                    {plan.ctaText}
                  </button>
                </motion.div>
              );
            })}
          </motion.div>

          {/* ── ENTERPRISE ROW ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mt-12 bg-white/70 backdrop-blur-md border border-[#E4E3DF] rounded-2xl p-8 md:p-10 flex flex-col lg:flex-row items-stretch justify-between gap-8 shadow-sm"
          >
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/5 rounded-full mb-4">
                <ShieldCheck size={12} className="text-[#6B6A67]" />
                <span className="text-[10px] font-bold text-[#6B6A67] tracking-wider uppercase font-plus-jakarta">
                  Regulated & Scale
                </span>
              </div>
              <h3 className="font-serif text-3xl text-[#0A0A0A] mb-3 font-normal">
                Enterprise
              </h3>
              <p className="text-[14px] text-[#6B6A67] leading-relaxed max-w-3xl mb-6">
                For larger engineering organizations requiring single sign-on (SSO), automated provisioning, strict data compliance, custom AI model configuration, and dedicated SLAs. Billed annually.
              </p>
              
              {/* Features inline list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                {[
                  "Unlimited members & meetings",
                  "SAML SSO & Okta / Azure AD",
                  "SCIM User Provisioning",
                  "SOC 2 Type II reports",
                  "Custom data residency (EU/US)",
                  "Dedicated success manager",
                  "99.9% Uptime Guarantee (SLA)",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#E8F5EE] text-[#1A6B3C] flex items-center justify-center">
                      <Check size={10} strokeWidth={3} />
                    </span>
                    <span className="text-[12px] text-[#0A0A0A] font-medium">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:border-l lg:border-[#E4E3DF] lg:pl-10 flex flex-col justify-center items-start lg:items-center min-w-[200px] flex-shrink-0">
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-sm text-[#6B6A67]">From</span>
                <span className="font-serif text-4xl text-[#0A0A0A] tracking-tight">$500</span>
                <span className="text-xs text-[#9B9A96]">/ mo</span>
              </div>
              <button
                onClick={() => {
                  analytics.pricingPlanClick("enterprise" as any);
                  openWaitlistModal();
                }}
                className="w-full lg:w-auto bg-[#0A0A0A] text-white hover:bg-[#1A6B3C] py-3.5 px-6 rounded-xl font-sans text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow hover:shadow-lg hover:shadow-[#1A6B3C]/5"
              >
                Contact Sales
                <ArrowRight size={13} />
              </button>
            </div>
          </motion.div>
        </section>

        {/* ── CUSTOMER LOGOS TRUST BAR ── */}
        <div className="mb-20">
          <CustomerLogos />
        </div>

        {/* ── INTERACTIVE COST & ROI CALCULATOR ── */}
        <section className="bg-white/40 border-y border-[#E4E3DF] py-20 px-6 backdrop-blur-sm relative">
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#1A6B3C]/3 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FAF9F5] border border-[#E4E3DF] rounded-full mb-4">
                <Calculator size={12} className="text-[#6B6A67]" />
                <span className="text-[10px] font-bold text-[#6B6A67] tracking-wider uppercase font-plus-jakarta">
                  Interactive Estimator
                </span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#0A0A0A] mb-4 font-normal tracking-tight">
                Calculate your Team plan & ROI
              </h2>
              <p className="text-sm sm:text-base text-[#6B6A67] max-w-xl mx-auto leading-relaxed">
                Adjust the parameters below to determine your recommended plan, compare with per-seat tools, and estimate your monthly time and money savings.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Sliders (Left Column) - 7 cols */}
              <div className="lg:col-span-7 bg-white/95 border border-[#E4E3DF] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col justify-between">
                <div className="space-y-8">
                  {/* Team Members Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label htmlFor="calc-members-input" className="text-xs sm:text-sm font-bold text-[#0A0A0A] uppercase tracking-wider">
                        Team Members
                      </label>
                      <span className="text-xs sm:text-sm font-bold text-[#1A6B3C] bg-[#E8F5EE] py-1 px-3 rounded-full font-plus-jakarta">
                        {calcMembers} members
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleDecrement(calcMembers, setCalcMembers, 1)}
                        className="w-9 h-9 rounded-xl border border-[#E4E3DF] bg-[#FAF9F5] hover:bg-[#E4E3DF]/50 flex items-center justify-center text-[#6B6A67] transition-all hover:text-black hover:scale-105 active:scale-95 cursor-pointer"
                        type="button"
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      
                      <input
                        id="calc-members-input"
                        type="range"
                        min="1"
                        max="100"
                        value={calcMembers}
                        onChange={(e) => setCalcMembers(parseInt(e.target.value))}
                        className="flex-1 slider-input"
                      />
                      
                      <button
                        onClick={() => handleIncrement(calcMembers, setCalcMembers, 100)}
                        className="w-9 h-9 rounded-xl border border-[#E4E3DF] bg-[#FAF9F5] hover:bg-[#E4E3DF]/50 flex items-center justify-center text-[#6B6A67] transition-all hover:text-black hover:scale-105 active:scale-95 cursor-pointer"
                        type="button"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                    <div className="flex justify-between mt-3 text-[10px] text-[#9B9A96] px-1 font-medium">
                      <span>1 member</span>
                      <span>3 (Free)</span>
                      <span>10 (Starter)</span>
                      <span>25 (Growth)</span>
                      <span>60 (Business)</span>
                      <span>100+</span>
                    </div>
                  </div>

                  {/* Monthly Meetings Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label htmlFor="calc-meetings-input" className="text-xs sm:text-sm font-bold text-[#0A0A0A] uppercase tracking-wider">
                        Monthly Meetings
                      </label>
                      <span className="text-xs sm:text-sm font-bold text-[#1A6B3C] bg-[#E8F5EE] py-1 px-3 rounded-full font-plus-jakarta">
                        {calcMeetings} meetings
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleDecrement(calcMeetings, setCalcMeetings, 1, 5)}
                        className="w-9 h-9 rounded-xl border border-[#E4E3DF] bg-[#FAF9F5] hover:bg-[#E4E3DF]/50 flex items-center justify-center text-[#6B6A67] transition-all hover:text-black hover:scale-105 active:scale-95 cursor-pointer"
                        type="button"
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      
                      <input
                        id="calc-meetings-input"
                        type="range"
                        min="1"
                        max="500"
                        value={calcMeetings}
                        onChange={(e) => setCalcMeetings(parseInt(e.target.value))}
                        className="flex-1 slider-input"
                      />
                      
                      <button
                        onClick={() => handleIncrement(calcMeetings, setCalcMeetings, 500, 5)}
                        className="w-9 h-9 rounded-xl border border-[#E4E3DF] bg-[#FAF9F5] hover:bg-[#E4E3DF]/50 flex items-center justify-center text-[#6B6A67] transition-all hover:text-black hover:scale-105 active:scale-95 cursor-pointer"
                        type="button"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                    <div className="flex justify-between mt-3 text-[10px] text-[#9B9A96] px-1 font-medium">
                      <span>1 meeting</span>
                      <span>5 (Free)</span>
                      <span>40 (Starter)</span>
                      <span>120 (Growth)</span>
                      <span>300 (Business)</span>
                      <span>500+</span>
                    </div>
                  </div>

                  {/* Blended Hourly Rate Input */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label htmlFor="calc-hourly-rate-input" className="text-xs sm:text-sm font-bold text-[#0A0A0A] uppercase tracking-wider">
                        Avg. Hourly Rate
                      </label>
                      <span className="text-xs sm:text-sm font-bold text-[#1A6B3C] bg-[#E8F5EE] py-1 px-3 rounded-full font-plus-jakarta">
                        ${calcHourlyRate}/hour
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleDecrement(calcHourlyRate, setCalcHourlyRate, 40, 5)}
                        className="w-9 h-9 rounded-xl border border-[#E4E3DF] bg-[#FAF9F5] hover:bg-[#E4E3DF]/50 flex items-center justify-center text-[#6B6A67] transition-all hover:text-black hover:scale-105 active:scale-95 cursor-pointer"
                        type="button"
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      
                      <input
                        id="calc-hourly-rate-input"
                        type="range"
                        min="40"
                        max="200"
                        step="5"
                        value={calcHourlyRate}
                        onChange={(e) => setCalcHourlyRate(parseInt(e.target.value))}
                        className="flex-1 slider-input"
                      />
                      
                      <button
                        onClick={() => handleIncrement(calcHourlyRate, setCalcHourlyRate, 200, 5)}
                        className="w-9 h-9 rounded-xl border border-[#E4E3DF] bg-[#FAF9F5] hover:bg-[#E4E3DF]/50 flex items-center justify-center text-[#6B6A67] transition-all hover:text-black hover:scale-105 active:scale-95 cursor-pointer"
                        type="button"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                    <div className="flex justify-between mt-3 text-[10px] text-[#9B9A96] px-1 font-medium">
                      <span>$40/hr (Jr. Dev)</span>
                      <span>$80/hr (Avg Blend)</span>
                      <span>$150/hr (Manager)</span>
                      <span>$200/hr (Director)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-[#FAF9F5] border border-[#E4E3DF] rounded-xl flex items-start gap-3">
                  <Info size={15} className="text-[#1A6B3C] flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] sm:text-xs text-[#6B6A67] leading-relaxed">
                    <strong>Value Formula:</strong> We estimate 15 minutes (0.25 hrs) saved per meeting in admin time (transcribing, extracting tasks, writing tickets, and tracking follow-ups).
                  </p>
                </div>
              </div>

              {/* Calculator Results (Right Column) - 5 cols */}
              <div className="lg:col-span-5 bg-gradient-to-b from-[#0F1E15] via-[#0A0A0A] to-[#0A0A0A] text-white rounded-2xl p-6 sm:p-8 border border-white/10 shadow-xl flex flex-col justify-between relative overflow-hidden">
                {/* Glowing glow circle inside */}
                <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] bg-[#1A6B3C]/20 rounded-full blur-3xl pointer-events-none" />

                <div className="space-y-6 relative z-10">
                  {/* Rec Plan Card */}
                  <div className="flex justify-between items-center bg-white/5 border border-white/5 p-4 rounded-xl">
                    <div>
                      <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
                        Recommended Plan
                      </span>
                      <h3 className="font-serif text-2xl text-[#6ECC8E] font-normal mt-0.5">
                        {calculatorResults.recommendedPlan}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
                        Plan Cost
                      </span>
                      <div className="flex items-baseline justify-end mt-0.5">
                        <span className="font-serif text-2xl text-white font-normal">
                          {calculatorResults.recommendedPlan === "Enterprise" ? "Custom" : `$${calculatorResults.basePrice}`}
                        </span>
                        {calculatorResults.recommendedPlan !== "Enterprise" && (
                          <span className="text-xs text-white/50 ml-0.5">/mo</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {calculatorResults.limitWarning && (
                    <div className="flex gap-2 bg-[#C84B31]/10 border border-[#C84B31]/30 rounded-xl p-3 items-start">
                      <Info size={14} className="text-[#C84B31] flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-white/90 leading-normal">
                        {calculatorResults.limitWarning}
                      </span>
                    </div>
                  )}

                  <div className="h-[1px] bg-white/10" />

                  {/* Savings & ROI Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="flex items-center gap-1.5 mb-1 text-[#6ECC8E]">
                        <Clock size={12} />
                        <span className="text-[9px] text-white/50 uppercase tracking-widest font-bold">
                          Time Saved / Mo
                        </span>
                      </div>
                      <p className="text-base sm:text-lg font-bold font-sans">
                        ~{calculatorResults.hoursSaved} hours
                      </p>
                      <span className="text-[10px] text-white/30">
                        15m saved per meet
                      </span>
                    </div>

                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="flex items-center gap-1.5 mb-1 text-[#6ECC8E]">
                        <TrendingUp size={12} />
                        <span className="text-[9px] text-white/50 uppercase tracking-widest font-bold">
                          ROI Value / Mo
                        </span>
                      </div>
                      <p className="text-base sm:text-lg font-bold font-sans text-[#6ECC8E]">
                        ${calculatorResults.financialRoi.toLocaleString()}
                      </p>
                      <span className="text-[10px] text-white/30">
                        Hours back × rate
                      </span>
                    </div>
                  </div>

                  {/* Visual Chart - ROI Comparison Bar Graph */}
                  <div className="bg-white/5 border border-white/5 rounded-xl p-4 relative">
                    <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold block mb-4">
                      Monthly Cost Comparison
                    </span>
                    
                    <div className="flex justify-around items-end h-[160px] pb-2 pt-6 relative">
                      {/* Grid background lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.05] border-b border-white">
                        <div className="border-b border-white w-full h-0" />
                        <div className="border-b border-white w-full h-0" />
                        <div className="border-b border-white w-full h-0" />
                        <div className="border-b border-white w-full h-0" />
                      </div>

                      {/* Bar 1: Competitors */}
                      <div className="flex flex-col items-center gap-2 w-1/3">
                        <span className="text-[10px] font-bold text-white/80">
                          ${calculatorResults.competitorCost}/mo
                        </span>
                        <motion.div
                          animate={{ height: `${Math.min(100, Math.max(10, (calculatorResults.competitorCost / Math.max(calculatorResults.competitorCost, calculatorResults.basePrice, 1)) * 100))}px` }}
                          transition={{ type: "spring", stiffness: 100, damping: 15 }}
                          className="w-full bg-[#C84B31]/80 rounded-t-lg relative group flex items-end justify-center pb-2"
                        >
                          <span className="text-[9px] uppercase tracking-wider font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity absolute top-[-20px] bg-black/95 px-2 py-0.5 rounded border border-white/10 whitespace-nowrap">
                            Per Seat
                          </span>
                        </motion.div>
                        <span className="text-[9px] uppercase text-white/50 tracking-wider font-semibold">
                          Seat-Based
                        </span>
                      </div>

                      {/* Savings overlay badge */}
                      {calculatorResults.monthlySavings > 0 && (
                        <motion.div 
                          key={calculatorResults.monthlySavings}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#E8F5EE] border border-[#1A6B3C]/30 text-[#1A6B3C] text-[10px] font-bold py-1 px-3 rounded-full shadow-md flex items-center gap-1"
                        >
                          <TrendingUp size={10} />
                          Save {Math.round((calculatorResults.monthlySavings / calculatorResults.competitorCost) * 100)}%
                        </motion.div>
                      )}

                      {/* Bar 2: Rapto */}
                      <div className="flex flex-col items-center gap-2 w-1/3">
                        <span className="text-[10px] font-bold text-[#6ECC8E]">
                          ${calculatorResults.basePrice}/mo
                        </span>
                        <motion.div
                          animate={{ height: `${Math.min(100, Math.max(10, (calculatorResults.basePrice / Math.max(calculatorResults.competitorCost, calculatorResults.basePrice, 1)) * 100))}px` }}
                          transition={{ type: "spring", stiffness: 100, damping: 15 }}
                          className="w-full bg-gradient-to-t from-[#1A6B3C] to-[#6ECC8E] rounded-t-lg relative group flex items-end justify-center pb-2 shadow-lg shadow-[#1A6B3C]/20"
                        >
                          <span className="text-[9px] uppercase tracking-wider font-bold text-[#6ECC8E] opacity-0 group-hover:opacity-100 transition-opacity absolute top-[-20px] bg-black/95 px-2 py-0.5 rounded border border-[#1A6B3C]/20 whitespace-nowrap">
                            Flat Rate
                          </span>
                        </motion.div>
                        <span className="text-[9px] uppercase text-[#6ECC8E] tracking-wider font-bold">
                          Rapto
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cost Transparency Stacked Bar */}
                  <div className="bg-white/5 border border-white/5 rounded-xl p-4">
                    <button
                      onClick={() => setShowTransparency(!showTransparency)}
                      className="w-full text-left flex justify-between items-center text-white/50 hover:text-white transition-colors duration-150 cursor-pointer"
                    >
                      <span className="text-[9px] uppercase tracking-widest font-bold flex items-center gap-1">
                        <Info size={11} />
                        Cost to Serve Transparency
                      </span>
                      {showTransparency ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    <div className="mt-3">
                      {/* Stacked bar container */}
                      <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex shadow-inner">
                        <motion.div
                          animate={{ width: `${transparencyWeights.recall}%` }}
                          transition={springTransition}
                          className="h-full bg-[#6ECC8E]"
                          title={`Recall Bot: $${calculatorResults.recallCost.toFixed(2)}`}
                        />
                        <motion.div
                          animate={{ width: `${transparencyWeights.claude}%` }}
                          transition={springTransition}
                          className="h-full bg-lime-400"
                          title={`Claude AI: $${calculatorResults.claudeCost.toFixed(2)}`}
                        />
                        <motion.div
                          animate={{ width: `${transparencyWeights.infra}%` }}
                          transition={springTransition}
                          className="h-full bg-[#9B9A96]"
                          title="Base Infra Allocation: $2.00"
                        />
                        {transparencyWeights.margin > 0 && (
                          <motion.div
                            animate={{ width: `${transparencyWeights.margin}%` }}
                            transition={springTransition}
                            className="h-full bg-[#1A6B3C]"
                            title={`Rapto Margin: $${(calculatorResults.basePrice - calculatorResults.totalInfraCost).toFixed(2)}`}
                          />
                        )}
                      </div>

                      {/* Legend (Mini stacked info) */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-white/50">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#6ECC8E]" />
                          <span>Recall Bots (${calculatorResults.recallCost.toFixed(2)})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-lime-400" />
                          <span>Claude API (${calculatorResults.claudeCost.toFixed(2)})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#9B9A96]" />
                          <span>Infra ($2.00)</span>
                        </div>
                        {transparencyWeights.margin > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1A6B3C]" />
                            <span>Margin (${(calculatorResults.basePrice - calculatorResults.totalInfraCost).toFixed(2)})</span>
                          </div>
                        )}
                      </div>

                      <AnimatePresence>
                        {showTransparency && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden mt-4 bg-white/5 border border-white/5 rounded-lg p-3 text-[10.5px] leading-relaxed text-white/70"
                          >
                            We allocate ~$0.70/hour for Recall.ai bots (avg meeting is 30 mins = $0.35) and ~3¢ per transcript generated by Claude-3-Haiku. The rest covers direct database hosting and our platform margin.
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                <button
                  onClick={openWaitlistModal}
                  className="w-full mt-8 py-4 px-6 rounded-xl bg-[#1A6B3C] text-white hover:bg-[#2D8A50] font-sans text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-lg shadow-[#1A6B3C]/10 hover:shadow-xl hover:shadow-[#1A6B3C]/20"
                >
                  Start free trial on recommended plan
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURE COMPARISON MATRIX ── */}
        <section className="px-6 py-20 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-serif text-3xl sm:text-4xl text-[#0A0A0A] mb-3 font-normal tracking-tight">
              Compare plans in detail
            </h2>
            <p className="text-sm text-[#6B6A67] max-w-lg mx-auto">
              Explore the granular breakdown of usage limits, extraction capabilities, integrations, and security.
            </p>
            
            <button
              onClick={() => {
                setShowMatrix(!showMatrix);
                trackEvent("pricing_table_toggled", { opened: !showMatrix });
              }}
              className="mt-6 inline-flex items-center gap-2 border border-[#1A6B3C] text-[#1A6B3C] hover:bg-[#1A6B3C]/5 py-2.5 px-5 rounded-xl font-sans text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm"
            >
              {showMatrix ? "Hide comparison table" : "Show comparison table"}
              {showMatrix ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          <AnimatePresence>
            {showMatrix && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                transition={{ duration: 0.3 }}
                className="overflow-x-auto border border-[#E4E3DF] rounded-2xl bg-white shadow-sm"
              >
                <table className="w-full border-collapse font-sans text-xs sm:text-[13px] text-left min-w-[800px]">
                  <thead>
                    <tr className="border-b-2 border-[#E4E3DF] bg-[#FAF9F5]">
                      <th className="p-4 sm:p-5 font-bold text-[#0A0A0A] w-[28%] uppercase tracking-wider text-[10px]">Feature</th>
                      <th className="p-4 sm:p-5 font-bold text-center text-[#0A0A0A] uppercase tracking-wider text-[10px]">Free</th>
                      <th className="p-4 sm:p-5 font-bold text-center text-[#0A0A0A] uppercase tracking-wider text-[10px]">Starter</th>
                      <th className="p-4 sm:p-5 font-bold text-center text-[#0A0A0A] uppercase tracking-wider text-[10px]">Growth</th>
                      <th className="p-4 sm:p-5 font-bold text-center text-[#0A0A0A] uppercase tracking-wider text-[10px]">Business</th>
                      <th className="p-4 sm:p-5 font-bold text-center text-[#0A0A0A] uppercase tracking-wider text-[10px]">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* USAGE LIMITS */}
                    <tr className="bg-[#FAF9F5]/80">
                      <td colSpan={6} className="px-4 sm:px-5 py-2.5 font-bold text-[#1A6B3C] text-[10px] letterSpacing-[0.05em] uppercase border-b border-[#E4E3DF]">
                        Usage Limits
                      </td>
                    </tr>
                    {[
                      { name: "Team Members", free: "3 members", starter: "10 members", growth: "25 members", business: "60 members", enterprise: "Unlimited" },
                      { name: "Meetings per Month", free: "5 meetings", starter: "40 meetings", growth: "120 meetings", business: "300 meetings", enterprise: "Unlimited" },
                      { name: "Meeting History", free: "7 days", starter: "90 days", growth: "1 year", business: "Unlimited", enterprise: "Unlimited" },
                      { name: "Workspaces", free: "1", starter: "1", growth: "1", business: "Up to 5", enterprise: "Unlimited" },
                    ].map((row, index) => (
                      <tr key={index} className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                        <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">{row.name}</td>
                        <td className="p-4 sm:p-5 text-center text-[#6B6A67]">{row.free}</td>
                        <td className="p-4 sm:p-5 text-center text-[#6B6A67]">{row.starter}</td>
                        <td className="p-4 sm:p-5 text-center text-[#6B6A67]">{row.growth}</td>
                        <td className="p-4 sm:p-5 text-center text-[#6B6A67]">{row.business}</td>
                        <td className="p-4 sm:p-5 text-center text-[#0A0A0A] font-semibold">{row.enterprise}</td>
                      </tr>
                    ))}

                    {/* BOT & RECORDING */}
                    <tr className="bg-[#FAF9F5]/80">
                      <td colSpan={6} className="px-4 sm:px-5 py-2.5 font-bold text-[#1A6B3C] text-[10px] letterSpacing-[0.05em] uppercase border-b border-[#E4E3DF]">
                        Bot & Recording
                      </td>
                    </tr>
                    {[
                      { name: "Bot Auto-Joins Meetings", free: true, starter: true, growth: true, business: true, enterprise: true },
                      { name: "Zoom, Google Meet, Teams", free: true, starter: true, growth: true, business: true, enterprise: true },
                      { name: "Webex Support", free: false, starter: true, growth: true, business: true, enterprise: true },
                    ].map((row, index) => (
                      <tr key={index} className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                        <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">{row.name}</td>
                        {[row.free, row.starter, row.growth, row.business, row.enterprise].map((val, i) => (
                          <td key={i} className="p-4 sm:p-5 text-center">
                            {val ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]">
                                <Check size={11} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="text-[#9B9A96]/60">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* AI EXTRACTION */}
                    <tr className="bg-[#FAF9F5]/80">
                      <td colSpan={6} className="px-4 sm:px-5 py-2.5 font-bold text-[#1A6B3C] text-[10px] letterSpacing-[0.05em] uppercase border-b border-[#E4E3DF]">
                        AI Extraction
                      </td>
                    </tr>
                    <tr className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                      <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">Commitment Extraction</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Basic</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Full</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Full</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Full</td>
                      <td className="p-4 sm:p-5 text-center text-[#0A0A0A] font-semibold">Customized</td>
                    </tr>
                    {[
                      { name: "Tasks, Decisions & Blockers", free: true, starter: true, growth: true, business: true, enterprise: true },
                      { name: "Cross-Meeting Memory", free: true, starter: true, growth: true, business: true, enterprise: true },
                      { name: "Confidence Score / Commitment", free: false, starter: true, growth: true, business: true, enterprise: true },
                    ].map((row, index) => (
                      <tr key={index} className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                        <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">{row.name}</td>
                        {[row.free, row.starter, row.growth, row.business, row.enterprise].map((val, i) => (
                          <td key={i} className="p-4 sm:p-5 text-center">
                            {val ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]">
                                <Check size={11} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="text-[#9B9A96]/60">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                      <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">Custom AI Categories</td>
                      <td className="p-4 sm:p-5 text-center text-[#9B9A96]/60">—</td>
                      <td className="p-4 sm:p-5 text-center text-[#9B9A96]/60">—</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Basic</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Full</td>
                      <td className="p-4 sm:p-5 text-center text-[#0A0A0A] font-semibold">Enterprise-wide</td>
                    </tr>

                    {/* INTEGRATIONS */}
                    <tr className="bg-[#FAF9F5]/80">
                      <td colSpan={6} className="px-4 sm:px-5 py-2.5 font-bold text-[#1A6B3C] text-[10px] letterSpacing-[0.05em] uppercase border-b border-[#E4E3DF]">
                        Integrations
                      </td>
                    </tr>
                    <tr className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                      <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">Slack</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">1 Workspace</td>
                      <td className="p-4 sm:p-5 text-center"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]"><Check size={11} strokeWidth={3} /></span></td>
                      <td className="p-4 sm:p-5 text-center"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]"><Check size={11} strokeWidth={3} /></span></td>
                      <td className="p-4 sm:p-5 text-center"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]"><Check size={11} strokeWidth={3} /></span></td>
                      <td className="p-4 sm:p-5 text-center"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]"><Check size={11} strokeWidth={3} /></span></td>
                    </tr>
                    {[
                      { name: "Google Calendar", free: true, starter: true, growth: true, business: true, enterprise: true },
                      { name: "Jira, Linear, Notion", free: false, starter: true, growth: true, business: true, enterprise: true },
                      { name: "Asana, GitHub, Outlook", free: false, starter: false, growth: true, business: true, enterprise: true },
                      { name: "API Access & Webhooks", free: false, starter: false, free_2: false, business: true, enterprise: true },
                    ].map((row, index) => (
                      <tr key={index} className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                        <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">{row.name}</td>
                        {/* We use double variables or helper list */}
                        {[row.free, row.starter, row.growth ?? row.free_2, row.business, row.enterprise].map((val, i) => (
                          <td key={i} className="p-4 sm:p-5 text-center">
                            {val ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]">
                                <Check size={11} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="text-[#9B9A96]/60">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* ALERTS & NOTIFICATIONS */}
                    <tr className="bg-[#FAF9F5]/80">
                      <td colSpan={6} className="px-4 sm:px-5 py-2.5 font-bold text-[#1A6B3C] text-[10px] letterSpacing-[0.05em] uppercase border-b border-[#E4E3DF]">
                        Alerts & Notifications
                      </td>
                    </tr>
                    {[
                      { name: "Slack DMs for Missed Tasks", free: true, starter: true, growth: true, business: true, enterprise: true },
                      { name: "Email Deadline Reminders", free: false, starter: true, growth: true, business: true, enterprise: true },
                      { name: "Weekly Manager Digest Email", free: false, starter: false, growth: true, business: true, enterprise: true },
                    ].map((row, index) => (
                      <tr key={index} className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                        <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">{row.name}</td>
                        {[row.free, row.starter, row.growth, row.business, row.enterprise].map((val, i) => (
                          <td key={i} className="p-4 sm:p-5 text-center">
                            {val ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]">
                                <Check size={11} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="text-[#9B9A96]/60">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* SECURITY & COMPLIANCE */}
                    <tr className="bg-[#FAF9F5]/80">
                      <td colSpan={6} className="px-4 sm:px-5 py-2.5 font-bold text-[#1A6B3C] text-[10px] letterSpacing-[0.05em] uppercase border-b border-[#E4E3DF]">
                        Security & Compliance
                      </td>
                    </tr>
                    {[
                      { name: "TLS 1.3 & AES-256 Encryption", free: true, starter: true, growth: true, business: true, enterprise: true },
                    ].map((row, index) => (
                      <tr key={index} className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                        <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">{row.name}</td>
                        {[row.free, row.starter, row.growth, row.business, row.enterprise].map((val, i) => (
                          <td key={i} className="p-4 sm:p-5 text-center">
                            {val ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]">
                                <Check size={11} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="text-[#9B9A96]/60">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                      <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">GDPR & CCPA Compliant</td>
                      <td className="p-4 sm:p-5 text-center"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]"><Check size={11} strokeWidth={3} /></span></td>
                      <td className="p-4 sm:p-5 text-center"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]"><Check size={11} strokeWidth={3} /></span></td>
                      <td className="p-4 sm:p-5 text-center"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]"><Check size={11} strokeWidth={3} /></span></td>
                      <td className="p-4 sm:p-5 text-center"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]"><Check size={11} strokeWidth={3} /></span></td>
                      <td className="p-4 sm:p-5 text-center text-[#0A0A0A] font-semibold">+ DPA</td>
                    </tr>
                    {[
                      { name: "SOC 2 Type II Audited", free: false, starter: false, growth: false, business: false, enterprise: true },
                      { name: "SAML SSO & SCIM Provisioning", free: false, starter: false, growth: false, business: false, enterprise: true },
                    ].map((row, index) => (
                      <tr key={index} className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                        <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">{row.name}</td>
                        {[row.free, row.starter, row.growth, row.business, row.enterprise].map((val, i) => (
                          <td key={i} className="p-4 sm:p-5 text-center">
                            {val ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8F5EE] text-[#1A6B3C]">
                                <Check size={11} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="text-[#9B9A96]/60">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* SUPPORT */}
                    <tr className="bg-[#FAF9F5]/80">
                      <td colSpan={6} className="px-4 sm:px-5 py-2.5 font-bold text-[#1A6B3C] text-[10px] letterSpacing-[0.05em] uppercase border-b border-[#E4E3DF]">
                        Support & SLAs
                      </td>
                    </tr>
                    <tr className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                      <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">Support Channel</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Documentation</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Email</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Email + Slack</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">Slack (Dedicated)</td>
                      <td className="p-4 sm:p-5 text-center text-[#0A0A0A] font-semibold">Dedicated CS Manager</td>
                    </tr>
                    <tr className="border-b border-[#E4E3DF] hover:bg-[#FAF9F5]/30 transition-colors">
                      <td className="p-4 sm:p-5 font-medium text-[#0A0A0A]">Response SLA</td>
                      <td className="p-4 sm:p-5 text-center text-[#9B9A96]/60">—</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">48 hours</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">24 hours</td>
                      <td className="p-4 sm:p-5 text-center text-[#6B6A67]">8 hours</td>
                      <td className="p-4 sm:p-5 text-center text-[#0A0A0A] font-semibold">4 hours</td>
                    </tr>
                  </tbody>
                </table>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── PRICING FAQ SECTION ── */}
        <section className="bg-white border-t border-[#E4E3DF] py-20 px-6" id="faq">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FAF9F5] border border-[#E4E3DF] rounded-full mb-4">
                <HelpCircle size={12} className="text-[#6B6A67]" />
                <span className="text-[10px] font-bold text-[#6B6A67] tracking-wider uppercase font-plus-jakarta">
                  Billing FAQ
                </span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#0A0A0A] mb-4 font-normal tracking-tight">
                Pricing & Billing Questions
              </h2>
              <p className="text-sm text-[#6B6A67] max-w-lg mx-auto">
                Everything you need to know about our flat plans, billing cycles, and data policies.
              </p>
            </div>

            <div className="border-t border-[#E4E3DF] divide-y divide-[#E4E3DF]">
              {pricingFaqs.map((faq, index) => {
                const isOpen = faqOpen === index;
                return (
                  <div key={index} className="py-2">
                    <button
                      onClick={() => toggleFaq(index)}
                      className="w-full py-6 flex justify-between items-center text-left gap-4 hover:text-[#1A6B3C] transition-colors focus:outline-none cursor-pointer"
                    >
                      <span className="font-sans text-sm sm:text-base font-semibold text-[#0A0A0A] leading-snug">
                        {faq.question}
                      </span>
                      <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-[#9B9A96]"
                      >
                        <ChevronDown size={16} />
                      </motion.div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <p className="pb-6 text-xs sm:text-sm text-[#6B6A67] leading-relaxed max-w-[90%]">
                            {faq.answer}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── TRUST & COMPLIANCE BANNER ── */}
        <section className="bg-[#FAF9F5] border-t border-[#E4E3DF] py-16 px-6">
          <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-12 text-center sm:text-left">
            {[
              { label: "SOC 2 Type II Compliant", desc: "Enterprise certified controls" },
              { label: "AES-256 Encryption", desc: "Data encrypted at rest & in transit" },
              { label: "GDPR & CCPA Ready", desc: "Your data processing rights protected" },
              { label: "100% Private", desc: "Never used to train AI models" },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center sm:items-start gap-1">
                <span className="font-sans text-sm font-bold text-[#0A0A0A]">
                  {item.label}
                </span>
                <span className="font-sans text-[11px] text-[#9B9A96]">
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── FINAL CALL TO ACTION ── */}
        <section className="bg-[#0A0A0A] text-white py-24 px-6 text-center relative overflow-hidden">
          {/* Subtle green ambient glow */}
          <motion.div
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.12, 0.2, 0.12],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-radial-gradient from-[#1A6B3C]/40 to-transparent rounded-full blur-3xl pointer-events-none"
          />

          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl mb-6 font-normal tracking-tight">
              Get started with Rapto today.
            </h2>
            <p className="text-sm sm:text-base text-white/70 max-w-lg mx-auto mb-10 leading-relaxed font-light">
              Boost meeting accountability, track commitments automatically, and integrate seamlessly with Jira, Slack, and Linear. No credit card required for trial.
            </p>
            
            <div className="flex flex-col sm:flex-row justify-center gap-4 max-w-sm sm:max-w-none mx-auto">
              <button
                onClick={openWaitlistModal}
                className="bg-[#1A6B3C] text-white hover:bg-[#2D8A50] py-4 px-8 rounded-xl font-sans text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-lg shadow-[#1A6B3C]/20 hover:shadow-xl hover:shadow-[#1A6B3C]/30"
              >
                Start your 14-day free trial
              </button>
              <button
                onClick={openWaitlistModal}
                className="bg-white/5 border border-white/10 hover:bg-white/10 py-4 px-8 rounded-xl font-sans text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer"
              >
                Request Custom Demo
              </button>
            </div>
            
            <p className="text-[11px] text-white/40 mt-6 font-light">
              Have questions? <a href="#faq" className="text-[#6ECC8E] hover:underline">Read our FAQ</a> or <a href="#" onClick={(e) => { e.preventDefault(); openWaitlistModal(); }} className="text-[#6ECC8E] hover:underline">contact support</a>.
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
      <MobileCTABar />

      {/* ── CUSTOM RANGE SLIDERS CSS ── */}
      <style jsx global>{`
        .slider-input {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 9999px;
          background: #E4E3DF;
          outline: none;
          transition: background 150ms ease;
        }

        .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #1A6B3C;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          transition: transform 150ms ease, background-color 150ms ease;
        }

        .slider-input::-webkit-slider-thumb:hover {
          transform: scale(1.18);
          background: #2D8A50;
        }

        .slider-input::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #1A6B3C;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          transition: transform 150ms ease, background-color 150ms ease;
        }

        .slider-input::-moz-range-thumb:hover {
          transform: scale(1.18);
          background: #2D8A50;
        }
      `}</style>
    </div>
  );
}
