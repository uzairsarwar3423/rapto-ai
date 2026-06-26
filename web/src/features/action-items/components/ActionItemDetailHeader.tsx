"use client";

import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X, Pencil } from "lucide-react";

interface ActionItemDetailHeaderProps {
  initialText: string;
  onSave: (text: string) => Promise<void>;
}

export function ActionItemDetailHeader({ initialText, onSave }: ActionItemDetailHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (!text.trim() || text.trim() === initialText) {
      setIsEditing(false);
      setText(initialText);
      return;
    }
    setLoading(true);
    try {
      await onSave(text.trim());
      setIsEditing(false);
    } catch {
      setText(initialText);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setText(initialText);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 w-full max-w-2xl pointer-events-auto">
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="text-xl font-heading font-semibold h-10 border border-border focus-visible:ring-0 focus-visible:border-brand py-1 px-2.5 bg-card"
        />
        <Button
          onClick={handleSave}
          disabled={loading || !text.trim()}
          size="icon"
          className="h-8 w-8 shrink-0 p-0"
        >
          <Check className="h-4 w-4 shrink-0" />
        </Button>
        <Button
          onClick={() => {
            setIsEditing(false);
            setText(initialText);
          }}
          disabled={loading}
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 p-0"
        >
          <X className="h-4 w-4 shrink-0" />
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="group flex items-center gap-2 text-left cursor-pointer hover:bg-muted/40 px-2.5 py-1 -ml-2.5 rounded transition-colors w-fit max-w-2xl border-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Click to edit"
    >
      <h1 className="text-xl font-heading font-semibold tracking-tight text-foreground truncate select-text">
        {text}
      </h1>
      <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-50 focus:opacity-50 transition-opacity shrink-0 text-muted-foreground" />
    </button>
  );
}
