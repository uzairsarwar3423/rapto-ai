"use client";

import React from 'react';
import Auth12 from '@/components/ui/auth-12';
import { NavLogo } from '@/components/ui/NavLogo';

interface AuthCardProps {
  children: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string;
  mode?: 'login' | 'register';
}

export function AuthCard({ children, title, subtitle, mode }: AuthCardProps) {
  return (
    <Auth12
      mode={mode}
      title={title}
      subtitle={subtitle}
      brandLogo={<NavLogo className="font-display text-2xl font-bold tracking-tight text-white flex items-center" />}
      brandLogoDark={<NavLogo className="font-display text-2xl font-bold tracking-tight text-ink flex items-center" />}
    >
      {children}
    </Auth12>
  );
}

