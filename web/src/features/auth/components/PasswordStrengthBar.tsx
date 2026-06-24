"use client";

import React from 'react';
import { cn } from '@/lib/cn';

interface PasswordStrengthBarProps {
  password?: string;
}

export function PasswordStrengthBar({ password = '' }: PasswordStrengthBarProps) {
  if (!password) return null;

  let score = 0;
  let label = '';
  let colorClass = 'bg-border';

  if (password.length > 0) {
    if (password.length < 8) {
      score = 1;
      label = 'Weak';
      colorClass = 'bg-error'; // brand HSL error or red
    } else {
      const hasUppercase = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[^A-Za-z0-9]/.test(password);

      if (hasUppercase && hasNumber && hasSpecial) {
        score = 4;
        label = 'Strong';
        colorClass = 'bg-emerald-500';
      } else if (hasUppercase && hasNumber) {
        score = 3;
        label = 'Good';
        colorClass = 'bg-yellow-500';
      } else {
        score = 2;
        label = 'Fair';
        colorClass = 'bg-orange-500';
      }
    }
  }

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Password strength:</span>
        <span className={cn("font-bold transition-all", 
          score === 1 && "text-error",
          score === 2 && "text-orange-500",
          score === 3 && "text-yellow-500",
          score === 4 && "text-emerald-500"
        )}>
          {label}
        </span>
      </div>
      
      {/* 4 horizontal bars */}
      <div className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className={cn(
              "h-1 rounded-full bg-border transition-all duration-300",
              index <= score ? colorClass : "bg-muted-subtle/20"
            )}
          />
        ))}
      </div>
    </div>
  );
}
export { cn };
