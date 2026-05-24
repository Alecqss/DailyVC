"use client"

import { cn } from "@/lib/utils"
import type { DemoStatus } from "@/lib/types"
import { DEMO_STATUS_LABELS } from "@/lib/types"
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react"

interface ProcessingStatusProps {
  status: DemoStatus
  progress: number
  className?: string
}

export function ProcessingStatus({ status, progress, className }: ProcessingStatusProps) {
  const isDone   = status === "done"
  const isError  = status === "error"
  const isActive = status === "parsing" || status === "rendering"

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isDone && <CheckCircle className="h-4 w-4 text-green-500" />}
          {isError && <AlertCircle className="h-4 w-4 text-destructive" />}
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <span
            className={cn(
              "font-medium",
              isDone && "text-green-500",
              isError && "text-destructive",
              !isDone && !isError && "text-foreground"
            )}
          >
            {DEMO_STATUS_LABELS[status]}
          </span>
        </div>
        {!isDone && !isError && (
          <span className="tabular-nums text-muted-foreground">{progress}%</span>
        )}
      </div>

      {!isDone && !isError && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
