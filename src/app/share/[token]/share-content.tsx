"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Zap, Play, Download, ArrowRight, AlertCircle, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Clip, Highlight, HighlightType } from "@/lib/types"
import { HIGHLIGHT_LABELS } from "@/lib/types"

type ClipWithHighlight = Clip & { highlight: Highlight }

// ── Mini video player ─────────────────────────────────────────────────────────

function VideoPlayer({ src }: { src: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-black">
      <video
        src={src}
        controls
        autoPlay
        playsInline
        className="w-full"
      />
    </div>
  )
}

function PlaceholderPlayer({ emoji }: { emoji: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-secondary text-6xl">
      {emoji}
    </div>
  )
}

// ── Emoji map ─────────────────────────────────────────────────────────────────

const TYPE_EMOJI: Record<string, string> = {
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShareContent() {
  const params = useParams()
  const router = useRouter()
  const token = typeof params.token === "string" ? params.token : params.token?.[0] ?? null

  const [clip, setClip]     = useState<ClipWithHighlight | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setLoading(false); setNotFound(true); return }

    const fetchClip = async () => {
      try {
        const { data, error } = await supabase
          .from("clips")
          .select("*, highlight:highlights(*)")
          .eq("share_token", token)
          .eq("is_public", true)
          .eq("status", "done")
          .single()

        if (error || !data) {
          setNotFound(true)
        } else {
          const c = data as ClipWithHighlight
          setClip(c)
          if (c.storage_path) {
            const { data: urlData } = supabase.storage
              .from("clips")
              .getPublicUrl(c.storage_path)
            if (urlData?.publicUrl) setVideoUrl(urlData.publicUrl)
          }
        }
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    fetchClip()
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <h1 className="text-lg font-semibold">Clip introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ce clip n'existe pas ou n'est plus public.
        </p>
        <Link
          href="/"
          className="mt-6 flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Retour à l'accueil
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    )
  }

  const type    = clip?.highlight?.type as HighlightType | undefined
  const emoji   = type ? (TYPE_EMOJI[type] ?? "🎮") : "🎮"
  const label   = type ? HIGHLIGHT_LABELS[type] : "Highlight"

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <Zap className="h-3.5 w-3.5 text-primary-foreground" fill="currentColor" />
            </div>
            <span className="text-sm font-bold">
              Highlight<span className="text-primary">.gg</span>
            </span>
          </Link>
          <Link
            href="/?action=signup"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-80"
          >
            Crée tes highlights
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* Title */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Highlight partagé</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {emoji} {label}
          </h1>
          {clip?.highlight?.round && (
            <p className="mt-1 text-sm text-muted-foreground">
              Round {clip.highlight.round} · {clip.highlight.kills} kill{clip.highlight.kills > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Video */}
        {videoUrl ? (
          <VideoPlayer src={videoUrl} />
        ) : (
          <PlaceholderPlayer emoji={emoji} />
        )}

        {/* Actions */}
        {videoUrl && (
          <div className="mt-4 flex gap-3">
            <a
              href={videoUrl}
              download
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Télécharger
            </a>
          </div>
        )}

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Play className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Tu veux tes propres highlights ?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Highlight.gg génère automatiquement des clips MP4 depuis tes démos CS2.
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-80"
          >
            Créer mon compte gratuitement
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  )
}
