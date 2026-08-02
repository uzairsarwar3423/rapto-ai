"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-200 ease-out-soft data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

const sheetVariants = {
  side: {
    top: "inset-x-0 top-0 h-auto border border-border rounded-b-2xl data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
    bottom:
      "inset-x-0 bottom-0 h-auto border border-border rounded-t-2xl data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
    left: "inset-y-0 left-0 h-full border border-border rounded-r-2xl data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
    right:
      "inset-y-0 right-0 h-full border border-border rounded-l-2xl data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
  },
  size: {
    sm: "sm:max-w-sm w-full",
    md: "sm:max-w-md w-full",
    lg: "sm:max-w-lg w-full",
    xl: "sm:max-w-xl w-full",
    "2xl": "sm:max-w-2xl w-full",
    full: "w-screen h-screen",
    auto: "w-auto",
  },
  variant: {
    default:
      "bg-background text-foreground shadow-2xl shadow-black/20 dark:shadow-black/60",
    floating:
      "sm:my-3 sm:mr-3 sm:h-[calc(100vh-24px)] sm:rounded-2xl bg-surface/95 backdrop-blur-xl text-foreground shadow-2xl ring-1 ring-foreground/5 dark:ring-white/10",
    glass:
      "bg-background/80 backdrop-blur-xl text-foreground shadow-2xl shadow-black/10 dark:shadow-black/50",
  },
}

interface SheetContentProps
  extends React.ComponentProps<typeof SheetPrimitive.Content> {
  side?: keyof typeof sheetVariants.side
  size?: keyof typeof sheetVariants.size
  variant?: keyof typeof sheetVariants.variant
  showCloseButton?: boolean
  showKbdHint?: boolean
}

function SheetContent({
  className,
  children,
  side = "right",
  size = "md",
  variant = "default",
  showCloseButton = true,
  showKbdHint = true,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col transition duration-200 ease-out-soft focus:outline-none focus-visible:outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=open]:duration-200",
          sheetVariants.side[side],
          sheetVariants.size[size],
          sheetVariants.variant[variant],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className={cn(
              "absolute top-5 right-5 inline-flex items-center gap-1.5 rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            {showKbdHint && (
              <kbd className="hidden sm:inline-flex h-5 items-center justify-center rounded bg-muted/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground select-none">
                ESC
              </kbd>
            )}
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close sheet</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex flex-col gap-1.5 px-6 pt-6 pb-4 text-left select-none",
        className
      )}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("flex-1 overflow-y-auto px-6 py-4 space-y-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex items-center justify-end gap-3 px-6 py-4 bg-muted/20 dark:bg-muted/10 rounded-b-inherit",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-lg font-semibold tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

