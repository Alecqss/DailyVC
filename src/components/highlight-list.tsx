"use client"

import { Film, Loader2, Swords } from "lucide-react"
import { cn } from "@/lib/utils"
import { HIGHLIGHT_LABELS, type Highlight, type HighlightType } from "@/lib/types"

interface HighlightListProps {
  highlights: Highlight[]
  loading?: boolean
  /** clip IDs keyed by highlight ID */
  clipMap?: Record<string, string>
  onGenerateClip?: (highlight: Highlight) => void
  onViewClip?: (highlightId: string) => void
  className?: string
}

const TYPE_ICONS: Record<string, string> = {
  multikill_ace: "🏆",
  multikill_4k:  "💥",
  multikill_3k:  "🔥",
  multikill_2k:  "⚡",
  clutch_1v5:    "😱",
  clutch_1v4:    "😱",
  clutch_1v3:    "💪",
  clutch_1v2:    "🎯",
  clutch_1v1:    "🎯",
  knife:         "🔪",
}

const TYPE_BADGE: Record<string, string> = {
  multikill_ace: "bg-yellow-500/15 text-yellow-400",
  multikill_4k:  "bg-orange-500/15 text-orange-400",
  multikill_3k:  "bg-primary/15 text-primary",
  multikill_2k:  "bg-indigo-500/15 text-indigo-400",
  clutch_1v5:    "bg-red-500/15 text-red-400",
  clutch_1v4:    "bg-red-500/15 text-red-400",
  clutch_1v3:    "bg-orange-500/15 text-orange-400",
  clutch_1v2:    "bg-primary/15 text-primary",
  clutch_1v1:    "bg-indigo-500/15 text-indigo-400",
  knife:         "bg-emerald-500/15 text-emerald-400",
}

function tickToSeconds(tick: number, tickrate = 64) {
  const totalSec = Math.floor(tick / tickrate)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function HighlightList({
  highlights,
  loading,
  clipMap = {},
  onGenerateClip,
  onViewClip,
  className,
}: HighlightListProps) {
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-16", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (highlights.length === 0) {
    return (
      <div className={cn("flex flex-col items-center gap-3 py-16 text-center", className)}>
        <Swords className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Aucun highlight détecté.</p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col divide-y divide-border", className)}>
      {highlights.map((h) => {
        const clipId  = clipMap[h.id]
        const icon    = TYPE_ICONS[h.type] ?? "🎮"
        const badge   = TYPE_BADGE[h.type] ?? "bg-muted text-muted-foreground"

        return (
          <div key={h.id} className="flex items-center gap-4 py-3.5">
            {/* Type badge */}
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base",
                badge
              )}
            >
              {icon}
            </div>

            {/* Info */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium leading-none text-foreground">
                {HIGHLIGHT_LABELS[h.type as HighlightType]}
              </span>
              <span className="text-xs text-muted-foreground">
                Round {h.round} · {h.kills} kill{h.kills > 1 ? "s" : ""} · {tickToSeconds(h.tick_start)}
              </span>
            </div>

            {/* Action */}
            {clipId ? (
              <button
                onClick={() => onViewClip?.(h.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Film className="h-3.5 w-3.5" />
                Voir le clip
              </button>
            ) : (
              <button
                onClick={() => onGenerateClip?.(h)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Film className="h-3.5 w-3.5" />
                Générer
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
