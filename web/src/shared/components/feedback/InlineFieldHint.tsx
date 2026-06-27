import React, { ReactNode } from "react";

interface InlineFieldHintProps {
  children: ReactNode;
}

export function InlineFieldHint({ children }: InlineFieldHintProps) {
  return (
    <p className="text-[12px] font-sans font-normal text-muted-foreground/60 mt-1 leading-normal select-none">
      {children}
    </p>
  );
}
