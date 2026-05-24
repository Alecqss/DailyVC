"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { type User } from "@supabase/supabase-js"
import { ChevronLeft, AlertCircle, Loader2, MapPin, Calendar } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { AppShell } from "@/components/app-shell"
import { ProcessingStatus } from "@/components/processing-status"
import { HighlightList } from "@/components/highlight-list"
import { useDemoRealtime } from "@/lib/supabase-realtime"
import type { Highlight } from "@/lib/types"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

export default function MatchContent() {
  const router = useRouter()
  const params = useParams()
  const demoId = typeof params.id === "string" ? params.id : params.id?.[0] ?? null

  const [user, setUser]             = useState<User | null>(null)
  const [checking, setChecking]     = useState(true)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [hlLoading, setHlLoading]   = useState(true)

  const { demo } = useDemoRealtime(demoId)

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

  // Load highlights
  useEffect(() => {
    if (!demoId) return
    const fetchHighlights = async () => {
      setHlLoading(true)
      try {
        const { data } = await supabase
          .from("highlights")
          .select("*")
          .eq("demo_id", demoId)
          .order("round", { ascending: true })
        setHighlights((data as Highlight[]) ?? [])
      } catch {
        // ignore — empty state shown
      } finally {
        setHlLoading(false)
      }
    }
    fetchHighlights()
  }, [demoId, demo?.status]) // re-fetch when status changes to "done"

  if (checking) return null

  const isProcessing = demo && (demo.status === "parsing" || demo.status === "rendering")
  const isError      = demo?.status === "error"

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        {/* Back */}
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Dashboard
        </Link>

        {!demo ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Match header */}
            <div className="mb-6 flex flex-col gap-1">
              <h1 className="text-xl font-bold text-foreground">{demo.filename}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {demo.map_name && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {demo.map_name}
                  </span>
                )}
                {demo.match_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(demo.match_date)}
                  </span>
                )}
              </div>
            </div>

            {/* Processing status */}
            {isProcessing && (
              <div className="mb-8 rounded-xl border border-border bg-secondary/40 p-4">
                <ProcessingStatus status={demo.status} progress={demo.progress} />
              </div>
            )}

            {/* Error */}
            {isError && (
              <div className="mb-8 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Erreur lors du traitement</p>
                  <p className="mt-0.5 text-xs text-destructive/70">
                    Réessaie ou contacte le support si le problème persiste.
                  </p>
                </div>
              </div>
            )}

            {/* Highlights */}
            <div className="rounded-xl border border-border bg-secondary/20">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold text-foreground">
                  Highlights détectés
                  {highlights.length > 0 && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                      {highlights.length}
                    </span>
                  )}
                </h2>
              </div>
              <div className="px-5">
                <HighlightList
                  highlights={highlights}
                  loading={hlLoading}
                  onGenerateClip={(h) => {
                    // Phase 2 — rendering
                    console.log("Generate clip for highlight", h.id)
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
