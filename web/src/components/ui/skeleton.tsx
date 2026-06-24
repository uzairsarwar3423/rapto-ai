import * as React from "react"
import { cn } from "@/lib/utils"

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
}

function Skeleton({ className, width, height, borderRadius, style, ...props }: SkeletonProps) {
  const customStyle: React.CSSProperties = {
    width: width !== undefined ? (typeof width === "number" ? `${width}px` : width) : undefined,
    height: height !== undefined ? (typeof height === "number" ? `${height}px` : height) : undefined,
    borderRadius: borderRadius !== undefined ? (typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius) : undefined,
    ...style,
  }

  return (
    <div
      className={cn("animate-pulse rounded-radius bg-muted-subtle/20", className)}
      style={customStyle}
      {...props}
    />
  )
}

export { Skeleton }
