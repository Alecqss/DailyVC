"use client"

import { Download, Share2, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { HIGHLIGHT_LABELS, type HighlightType } from "@/lib/types"

interface ClipCardProps {
  id: string
  type: HighlightType
  mapName: string
  durationSec: number
  createdAt: string
  shareToken: string
  storageUrl?: string
  className?: string
  onCopyLink?: (token: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  multikill_ace: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  multikill_4k:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
  multikill_3k:  "bg-primary/15 text-primary border-primary/30",
  multikill_2k:  "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  clutch_1v5:    "bg-red-500/15 text-red-400 border-red-500/30",
  clutch_1v4:    "bg-red-500/15 text-red-400 border-red-500/30",
  clutch_1v3:    "bg-orange-500/15 text-orange-400 border-orange-500/30",
  clutch_1v2:    "bg-primary/15 text-primary border-primary/30",
  clutch_1v1:    "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  knife:         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function ClipCard({
  id,
  type,
  mapName,
  durationSec,
  createdAt,
  shareToken,
  storageUrl,
  className,
  onCopyLink,
}: ClipCardProps) {
  const badgeClass = TYPE_COLORS[type] ?? "bg-muted text-muted-foreground border-border"

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-secondary",
        className
      )}
    >
      {/* Thumbnail / preview */}
      <div className="relative aspect-video w-full bg-muted/50 flex items-center justify-center">
        {storageUrl ? (
          <video
            src={storageUrl}
            className="h-full w-full object-cover"
            preload="metadata"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Play className="h-8 w-8" />
            <span className="text-xs">Clip {id.slice(0, 6)}</span>
          </div>
        )}

        {/* Play overlay */}
        <button
          aria-label="Lire le clip"
          className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/0 transition-all group-hover:bg-white/20 group-hover:scale-110">
            <Play className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" fill="currentColor" />
          </div>
        </button>

        {/* Duration badge */}
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
          {formatDuration(durationSec)}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                badgeClass
              )}
            >
              {HIGHLIGHT_LABELS[type]}
            </span>
            <p className="mt-1.5 text-xs text-muted-foreground">{mapName}</p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">{formatDate(createdAt)}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {storageUrl && (
            <a
              href={storageUrl}
              download
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              Télécharger
            </a>
          )}
          <button
            onClick={() => onCopyLink?.(shareToken)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Share2 className="h-3.5 w-3.5" />
            Partager
          </button>
        </div>
      </div>
    </div>
  )
}
