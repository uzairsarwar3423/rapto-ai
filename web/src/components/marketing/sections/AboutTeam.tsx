"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

const TwitterIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const team = [
  {
    name: "Alex Rivera",
    role: "Founder & CEO",
    bio: "Former engineering leader at Stripe. Obsessed with async workflows and team productivity.",
    image: "https://i.pravatar.cc/300?img=11",
    socials: {
      twitter: "#",
      linkedin: "#",
    },
  },
  {
    name: "Sarah Chen",
    role: "Head of Product",
    bio: "Product designer turned PM. Passionate about building intuitive interfaces for complex data.",
    image: "https://i.pravatar.cc/300?img=5",
    socials: {
      twitter: "#",
      linkedin: "#",
      github: "#",
    },
  },
  {
    name: "Marcus Johnson",
    role: "Lead Engineer",
    bio: "AI and machine learning specialist. Building the engine that powers Rapto's commitment extraction.",
    image: "https://i.pravatar.cc/300?img=12",
    socials: {
      github: "#",
      linkedin: "#",
    },
  },
  {
    name: "Elena Rodriguez",
    role: "Customer Success",
    bio: "Dedicated to ensuring every Rapto user gets the most out of their team's meetings.",
    image: "https://i.pravatar.cc/300?img=9",
    socials: {
      twitter: "#",
      linkedin: "#",
    },
  },
];

export function AboutTeam() {
  return (
    <section className="py-24 bg-surface-2 border-t border-border">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight"
            style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
          >
            Meet the Team
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-muted font-sans max-w-2xl mx-auto"
          >
            We're a fully remote team spanning 4 continents, united by our mission to make remote work actually work.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {team.map((member, index) => (
            <motion.div
              key={member.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="group relative"
            >
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden mb-5 bg-surface border border-border">
                {/* Fallback avatar if next/image src is remote and domain isn't configured, though pravatar is usually fine. 
                    Using standard img for simplicity and avoiding next.config domains issue */}
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <h3 className="text-xl font-bold text-foreground font-sans mb-1">
                {member.name}
              </h3>
              <p className="text-brand font-medium text-sm mb-3 font-sans">
                {member.role}
              </p>
              <p className="text-muted text-sm leading-relaxed mb-4 font-sans line-clamp-3">
                {member.bio}
              </p>
              <div className="flex items-center gap-3">
                {member.socials.twitter && (
                  <Link href={member.socials.twitter} className="text-muted hover:text-brand transition-colors">
                    <TwitterIcon className="w-4 h-4" />
                  </Link>
                )}
                {member.socials.linkedin && (
                  <Link href={member.socials.linkedin} className="text-muted hover:text-brand transition-colors">
                    <LinkedinIcon className="w-4 h-4" />
                  </Link>
                )}
                {member.socials.github && (
                  <Link href={member.socials.github} className="text-muted hover:text-brand transition-colors">
                    <GithubIcon className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
