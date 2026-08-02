"use client";

import React, { useState } from "react";
import { SlidersHorizontal, Sparkles, Layers, ShieldCheck, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";

export function SheetShowcaseDrawer() {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<"default" | "floating" | "glass">("floating");
  const [size, setSize] = useState<"sm" | "md" | "lg" | "xl">("md");
  const [side, setSide] = useState<"right" | "left" | "bottom">("right");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 bg-surface/60 hover:bg-surface border-0 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04] dark:ring-white/[0.08]"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-brand" />
          <span>SaaS Sheet Drawer</span>
          <Badge variant="outline" className="text-[10px] bg-brand-subtle text-brand border-0">
            Minimalist
          </Badge>
        </Button>
      </SheetTrigger>

      <SheetContent side={side} size={size} variant={variant}>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-brand/10 text-brand flex items-center justify-center font-bold">
              <Sparkles className="h-4 w-4" />
            </div>
            <SheetTitle>Minimalist Sheet Drawer</SheetTitle>
          </div>
          <SheetDescription>
            Engineered with zero harsh gray borders, soft depth elevation, and spring transitions inspired by Linear & Stripe.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {/* Variant Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Sheet Aesthetic Variant
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["floating", "default", "glass"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVariant(v)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl text-xs font-medium capitalize transition-all select-none ${
                    variant === v
                      ? "bg-brand text-white shadow-md shadow-brand/20 scale-[1.02]"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  {v === "floating" && <Layers className="h-4 w-4 mb-1" />}
                  {v === "default" && <ShieldCheck className="h-4 w-4 mb-1" />}
                  {v === "glass" && <Sparkles className="h-4 w-4 mb-1" />}
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Size Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Drawer Size
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(["sm", "md", "lg", "xl"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`py-2 rounded-lg text-xs font-mono font-medium transition-all ${
                    size === s
                      ? "bg-foreground text-background font-bold"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Side Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Dock Anchor
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["right", "left", "bottom"] as const).map((sd) => (
                <button
                  key={sd}
                  type="button"
                  onClick={() => setSide(sd)}
                  className={`py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                    side === sd
                      ? "bg-muted/80 text-foreground font-semibold ring-1 ring-foreground/10"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {sd}
                </button>
              ))}
            </div>
          </div>

          {/* Sample SaaS Form Section */}
          <div className="rounded-2xl bg-muted/20 dark:bg-muted/10 p-4 space-y-4">
            <h4 className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Action Plan Configuration</span>
              <Badge variant="outline" className="text-[10px] border-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Live Preview
              </Badge>
            </h4>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Task Title</label>
              <Input
                placeholder="e.g., Redesign Dashboard without 1px gray lines"
                defaultValue="Implement Borderless Surface Elevation"
                className="bg-background/80 border-0 ring-1 ring-black/5 dark:ring-white/10 text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Owner</label>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-background/80 ring-1 ring-black/5 dark:ring-white/10">
                <div className="h-6 w-6 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center">
                  PE
                </div>
                <span className="text-xs font-medium text-foreground">Principal UI/UX Engineer</span>
              </div>
            </div>
          </div>
        </SheetBody>

        <SheetFooter className="gap-2">
          <SheetClose asChild>
            <Button variant="ghost" size="sm" className="text-xs">
              Cancel
            </Button>
          </SheetClose>
          <Button
            size="sm"
            onClick={() => setOpen(false)}
            className="btn-add-meeting gap-1.5 text-xs font-medium"
          >
            <span>Save Configuration</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
