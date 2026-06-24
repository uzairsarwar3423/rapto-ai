import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wider uppercase transition-colors focus:outline-none focus:ring-2 focus:ring-brand",
  {
    variants: {
      variant: {
        default: "bg-brand text-white",
        pending: "bg-pending-bg text-pending-text",
        fulfilled: "bg-fulfilled-bg text-fulfilled-text",
        missed: "bg-missed-bg text-missed-text",
        deferred: "bg-deferred-bg text-deferred-text",
        recording: "bg-error text-white animate-pulse",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
