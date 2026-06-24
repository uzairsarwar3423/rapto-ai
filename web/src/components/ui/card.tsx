import * as React from "react"
import { cn } from "@/lib/utils"

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardRoot = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-radius-lg border border-border bg-surface text-foreground shadow-sm p-5 flex flex-col gap-4 transition-all duration-base",
        className
      )}
      {...props}
    />
  )
)
CardRoot.displayName = "CardRoot"

const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
)
CardHeader.displayName = "CardHeader"

const CardContent = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex-1", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-end gap-2 border-t border-border pt-4", className)}
      {...props}
    />
  )
)
CardFooter.displayName = "CardFooter"

export { CardRoot, CardHeader, CardContent, CardFooter, CardRoot as Card }
