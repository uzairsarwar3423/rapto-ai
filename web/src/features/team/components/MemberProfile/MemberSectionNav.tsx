"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useScrollSpy } from "@/shared/hooks/useScrollSpy";

interface Section {
  id: string;
  label: string;
}

interface MemberSectionNavProps {
  sections: Section[];
}

export function MemberSectionNav({ sections }: MemberSectionNavProps) {
  const [activeId, setActiveId] = useScrollSpy(sections.map((s) => s.id));

  return (
    <nav className="sticky top-[48px] z-10 flex gap-4 h-9 items-center border-b bg-background/95 backdrop-blur-sm px-1 select-none">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => {
            setActiveId(s.id);
            document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className={cn(
            "text-[13px] pb-2 -mb-px border-b-2 transition-colors duration-150 cursor-pointer outline-none",
            activeId === s.id
              ? "font-plus-jakarta font-semibold border-brand text-foreground"
              : "font-sans font-normal border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
