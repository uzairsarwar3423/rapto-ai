"use client";

import React, { useState, useMemo } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  name: string;
}

interface SearchableChannelPickerProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

export function SearchableChannelPicker({
  options = [],
  value,
  onChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  disabled = false,
}: SearchableChannelPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.id === value);
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.name.toLowerCase().includes(query) ||
        opt.id.toLowerCase().includes(query)
    );
  }, [options, search]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full h-8 justify-between text-xs font-sans text-left font-normal border-muted/30 px-3 hover:bg-muted/10 transition-colors select-none"
        >
          <span className="truncate">{selectedOption ? selectedOption.name : placeholder}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 max-h-60 flex flex-col font-sans select-none border border-muted/20 bg-background shadow-md rounded-lg">
        <div className="flex items-center border-b border-muted/10 px-2 h-8">
          <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-40" />
          <input
            className="flex h-6 w-full rounded-md bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-1 py-1.5 max-h-48 space-y-0.5">
          {filteredOptions.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground/60">
              No results found.
            </div>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option.id)}
                className={cn(
                  "relative flex w-full items-center rounded-md px-2 py-1.5 text-xs outline-none select-none text-left transition-colors font-sans",
                  option.id === value
                    ? "bg-muted text-foreground"
                    : "hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="truncate flex-1">{option.name}</span>
                {option.id === value && (
                  <Check className="ml-auto h-3 w-3 text-foreground stroke-[2.5]" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
