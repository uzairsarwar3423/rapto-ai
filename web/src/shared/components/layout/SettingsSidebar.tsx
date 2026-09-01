"use client";

import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  User,
  Building2,
  Users,
  Blocks,
  CreditCard,
  Bell,
  Shield,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  comingDay?: number;
}

const SETTINGS_NAV: readonly NavItem[] = [
  { href: '/settings/profile', label: 'Profile', icon: User, enabled: true },
  { href: '/settings/team', label: 'Team', icon: Building2, enabled: true },
  { href: '/settings/members', label: 'Members', icon: Users, enabled: true },
  { href: '/settings/integrations', label: 'Integrations', icon: Blocks, enabled: true },
  { href: '/settings/billing', label: 'Billing', icon: CreditCard, enabled: true },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell, enabled: true },
  { href: '/settings/security', label: 'Security', icon: Shield, enabled: true },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement | null>(null);

  // Auto-scroll active tab into view horizontally on mobile
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [pathname]);

  return (
    <>
      {/* ── Mobile & Small Tablet Horizontal Tab Bar (< md) ── */}
      <nav
        aria-label="Settings mobile tabs"
        className="md:hidden sticky top-0 z-20 bg-background/95 backdrop-blur-md -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-border pb-2.5 pt-1 select-none"
      >
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
          {SETTINGS_NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;

            if (!item.enabled) {
              return (
                <span
                  key={item.href}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-sans text-muted-foreground/40 bg-muted/20 cursor-default shrink-0"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <span>{item.label}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 normal-case font-normal select-none">
                    Soon
                  </Badge>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                ref={active ? activeTabRef : null}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all duration-150',
                  active
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-background' : 'text-muted-foreground')} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Desktop Vertical Sidebar (>= md) ── */}
      <nav
        aria-label="Settings"
        className="hidden md:block w-[200px] lg:w-[220px] shrink-0 sticky top-6 self-start py-2 px-1 select-none"
      >
        <h2 className="font-heading font-semibold text-[11px] px-2 mb-2 text-muted-foreground/80 uppercase tracking-wider">
          Settings
        </h2>
        <ul className="space-y-1">
          {SETTINGS_NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;

            if (!item.enabled) {
              return (
                <li key={item.href}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center justify-between h-8 px-2 rounded-lg text-[13px] font-sans text-muted-foreground/50 cursor-default">
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 shrink-0 opacity-50" />
                            <span>{item.label}</span>
                          </span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 normal-case font-normal select-none">
                            Soon
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        Coming Day {item.comingDay}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-2.5 h-8.5 px-2.5 rounded-lg text-[13px] font-sans transition-all duration-150',
                    active
                      ? 'font-medium bg-muted text-foreground shadow-2xs'
                      : 'font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      active ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground'
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
