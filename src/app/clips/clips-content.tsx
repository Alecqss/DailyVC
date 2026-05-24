"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { type User } from "@supabase/supabase-js"
import { Film, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { AppShell } from "@/components/app-shell"
import { ClipCard } from "@/components/clip-card"
import type { Clip, Highlight, HighlightType } from "@/lib/types"
import { HIGHLIGHT_LABELS } from "@/lib/types"

// ── Types ─────────────────────────────────────────────────────────────────────

type ClipWithHighlight = Clip & { highlight: Highlight }

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_TYPES = Object.keys(HIGHLIGHT_LABELS) as HighlightType[]

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClipsContent() {
  const router = useRouter()
  const [user, setUser]         = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [clips, setClips]       = useState<ClipWithHighlight[]>([])
  const [loading, setLoading]   = useState(true)
  const [filterType, setFilterType] = useState<HighlightType | "all">("all")
  const [copied, setCopied]     = useState<string | null>(null)

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!session) router.push("/")
        else setUser(session.user)
        setChecking(false)
      })
      .catch(() => { router.push("/"); setChecking(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) router.push("/")
      else setUser(session.user)
    })
    return () => subscription.unsubscribe()
  }, [router])

  // Load clips
  useEffect(() => {
    if (!user) return
    const fetchClips = async () => {
      try {
        const { data } = await supabase
          .from("clips")
          .select("*, highlight:highlights(*)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
        setClips((data as ClipWithHighlight[]) ?? [])
      } catch {
        // ignore — empty state shown
      } finally {
        setLoading(false)
      }
    }
    fetchClips()
  }, [user])

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  if (checking) return null

  const filtered = filterType === "all"
    ? clips
    : clips.filter((c) => c.highlight?.type === filterType)

  // Which types actually have clips?
  const usedTypes = Array.from(new Set(clips.map((c) => c.highlight?.type).filter(Boolean))) as HighlightType[]

  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Mes clips</h1>
        <p className="text-sm text-muted-foreground">
          {clips.length === 0
            ? "Aucun clip encore généré."
            : `${clips.length} clip${clips.length > 1 ? "s" : ""} généré${clips.length > 1 ? "s" : ""}`
          }
        </p>
      </div>

      {/* Copied toast */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-popover px-4 py-2 text-sm font-medium text-foreground shadow-lg">
          ✓ Lien copié dans le presse-papiers
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : clips.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
            <Film className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Aucun clip généré</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Importe une démo et génère tes premiers highlights pour les voir ici.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          {usedTypes.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setFilterType("all")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filterType === "all"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Tous ({clips.length})
              </button>
              {usedTypes.map((t) => {
                const count = clips.filter((c) => c.highlight?.type === t).length
                return (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      filterType === t
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {HIGHLIGHT_LABELS[t]} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {/* Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((clip) => {
              // Get public URL from Supabase storage
              const { data } = supabase.storage.from("clips").getPublicUrl(clip.storage_path)
              return (
                <ClipCard
                  key={clip.id}
                  id={clip.id}
                  type={clip.highlight?.type as HighlightType}
                  mapName="—"
                  durationSec={clip.duration_sec}
                  createdAt={clip.created_at}
                  shareToken={clip.share_token}
                  storageUrl={data?.publicUrl}
                  onCopyLink={handleCopyLink}
                />
              )
            })}
          </div>
        </>
      )}
    </AppShell>
  )
}
