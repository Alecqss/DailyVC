"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { type User } from "@supabase/supabase-js"
import { Upload, Film, ChevronRight, Clock, CheckCircle2, AlertCircle, Loader2, Zap } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { AppShell } from "@/components/app-shell"
import { useUserDemos } from "@/lib/supabase-realtime"
import { ProcessingStatus } from "@/components/processing-status"
import type { Demo, DemoStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function StatusIcon({ status }: { status: DemoStatus }) {
  if (status === "done")    return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === "error")   return <AlertCircle  className="h-4 w-4 text-destructive" />
  return <Loader2 className="h-4 w-4 animate-spin text-primary" />
}

function DemoRow({ demo }: { demo: Demo }) {
  const isActive = demo.status === "parsing" || demo.status === "rendering"

  return (
    <Link
      href={`/match/${demo.id}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-secondary/40 p-4 transition-colors hover:bg-secondary"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Film className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{demo.filename}</p>
        <div className="mt-0.5 flex items-center gap-2">
          {demo.map_name && (
            <span className="text-xs text-muted-foreground">{demo.map_name}</span>
          )}
          {demo.match_date && (
            <span className="text-xs text-muted-foreground">· {formatDate(demo.match_date)}</span>
          )}
        </div>
        {isActive && (
          <div className="mt-2">
            <ProcessingStatus status={demo.status} progress={demo.progress} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusIcon status={demo.status} />
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  )
}

export default function DashboardContent() {
  const router = useRouter()
  const [user, setUser]       = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const { demos, loading: demosLoading } = useUserDemos(user?.id ?? null)

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

  if (checking) return null

  const recentDemos  = demos.slice(0, 5)
  const activeDemos  = demos.filter((d) => d.status === "parsing" || d.status === "rendering")
  const doneDemos    = demos.filter((d) => d.status === "done")
  const username     = user?.user_metadata?.first_name ?? user?.email?.split("@")[0] ?? "Joueur"

  return (
    <AppShell>
      {/* Greeting */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Salut, {username} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {demos.length === 0
              ? "Importe ta première démo pour démarrer."
              : `${demos.length} démo${demos.length > 1 ? "s" : ""} · ${doneDemos.length} terminée${doneDemos.length > 1 ? "s" : ""}`
            }
          </p>
        </div>
        <Link
          href="/upload"
          className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-80"
        >
          <Upload className="h-4 w-4" />
          Importer une démo
        </Link>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Démos importées", value: demos.length, icon: Film,          color: "text-primary"    },
          { label: "En traitement",   value: activeDemos.length, icon: Loader2, color: "text-amber-400"  },
          { label: "Terminées",       value: doneDemos.length, icon: CheckCircle2, color: "text-green-500" },
          { label: "Clips générés",   value: 0,              icon: Zap,         color: "text-violet-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 p-4">
            <Icon className={cn("h-5 w-5", color)} />
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Active processing */}
      {activeDemos.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            En cours de traitement
          </h2>
          <div className="flex flex-col gap-2">
            {activeDemos.map((d) => <DemoRow key={d.id} demo={d} />)}
          </div>
        </div>
      )}

      {/* Recent demos */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Dernières démos
          </h2>
          {demos.length > 5 && (
            <Link href="/clips" className="text-xs text-primary hover:underline">
              Tout voir
            </Link>
          )}
        </div>

        {demosLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recentDemos.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Upload className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Aucune démo importée</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Importe ton premier fichier .dem pour générer tes highlights.
              </p>
            </div>
            <Link
              href="/upload"
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-80"
            >
              <Upload className="h-4 w-4" />
              Importer une démo
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentDemos.map((d) => <DemoRow key={d.id} demo={d} />)}
          </div>
        )}
      </div>

      {/* Recent clips */}
      {doneDemos.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Derniers clips
            </h2>
            <Link href="/clips" className="text-xs text-primary hover:underline">
              Voir tous les clips
            </Link>
          </div>
          {/* Clip section — populated once clips table is wired */}
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-10 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Les clips apparaîtront ici après traitement.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  )
}
