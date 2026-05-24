"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { type User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { AppShell } from "@/components/app-shell"
import { DemoUploadZone } from "@/components/demo-upload-zone"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AlertCircle, Info } from "lucide-react"

// ── Action types available for detection ──────────────────────────────────────

const ACTION_GROUPS = [
  {
    label: "Multi-kills",
    items: [
      { id: "multikill_2k",  label: "Double Kill (2K)" },
      { id: "multikill_3k",  label: "Triple Kill (3K)" },
      { id: "multikill_4k",  label: "Quadro Kill (4K)" },
      { id: "multikill_ace", label: "ACE (5K)" },
    ],
  },
  {
    label: "Clutchs",
    items: [
      { id: "clutch_1v1", label: "1v1 Clutch" },
      { id: "clutch_1v2", label: "1v2 Clutch" },
      { id: "clutch_1v3", label: "1v3 Clutch" },
      { id: "clutch_1v4", label: "1v4 Clutch" },
      { id: "clutch_1v5", label: "1v5 Clutch" },
    ],
  },
  {
    label: "Spéciaux",
    items: [
      { id: "knife", label: "Knife Kill" },
    ],
  },
]

const DEFAULT_ACTIONS = new Set([
  "multikill_3k", "multikill_4k", "multikill_ace",
  "clutch_1v2", "clutch_1v3", "clutch_1v4", "clutch_1v5",
  "knife",
])

// ── Component ─────────────────────────────────────────────────────────────────

export default function UploadContent() {
  const router = useRouter()
  const [user, setUser]         = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [file, setFile]         = useState<File | null>(null)
  const [actions, setActions]   = useState<Set<string>>(new Set(DEFAULT_ACTIONS))
  const [clipBefore, setClipBefore] = useState(10)
  const [clipAfter,  setClipAfter]  = useState(5)
  const [uploading,  setUploading]  = useState(false)
  const [error, setError]           = useState<string | null>(null)

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

  const toggleAction = (id: string) => {
    setActions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !user) return
    if (actions.size === 0) {
      setError("Sélectionne au moins un type d'action à détecter.")
      return
    }

    setUploading(true)
    setError(null)

    try {
      // 1. Upload the .dem file to Supabase Storage
      const storagePath = `${user.id}/${Date.now()}_${file.name}`
      const { error: storageError } = await supabase.storage
        .from("demos")
        .upload(storagePath, file, { cacheControl: "3600", upsert: false })

      if (storageError) throw storageError

      // 2. Insert a demo record
      const { data: demo, error: dbError } = await supabase
        .from("demos")
        .insert({
          user_id:      user.id,
          filename:     file.name,
          storage_path: storagePath,
          status:       "uploaded",
          progress:     0,
          action_types: Array.from(actions),
          pre_seconds:  clipBefore,
          post_seconds: clipAfter,
        })
        .select()
        .single()

      if (dbError) throw dbError

      // 3. Redirect to dashboard
      router.push(`/match/${(demo as { id: string }).id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload.")
    } finally {
      setUploading(false)
    }
  }

  if (checking) return null

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Importer une démo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisis ton fichier .dem et configure les types de highlights à détecter.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-8">

          {/* ── File upload ── */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-foreground">Fichier démo</h2>
            <DemoUploadZone
              onFileSelect={setFile}
              selectedFile={file}
              onClear={() => setFile(null)}
              disabled={uploading}
            />

            {/* Info */}
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Récupère ta démo dans CS2 → Jouer → Replays, ou dans{" "}
                <code className="font-mono">Steam/userdata/…/730/local/cfg</code>.
                Format supporté : <code className="font-mono">.dem</code>
              </span>
            </div>
          </section>

          {/* ── Actions to detect ── */}
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Actions à détecter</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sélectionne les types de plays pour lesquels générer des clips.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              {ACTION_GROUPS.map(({ label, items }) => (
                <div key={label}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map(({ id, label: itemLabel }) => {
                      const checked = actions.has(id)
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleAction(id)}
                          disabled={uploading}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                            checked
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-secondary/40 text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground"
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background"
                            )}
                          >
                            {checked && "✓"}
                          </div>
                          {itemLabel}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setActions(new Set(DEFAULT_ACTIONS))}
              className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Réinitialiser la sélection
            </button>
          </section>

          {/* ── Clip duration ── */}
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Durée des clips</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Secondes incluses avant et après chaque action.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Avant l'action", value: clipBefore, min: 3, max: 30, set: setClipBefore },
                { label: "Après l'action", value: clipAfter,  min: 2, max: 15, set: setClipAfter  },
              ].map(({ label, value, min, max, set }) => (
                <div key={label} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold tabular-nums text-foreground">{value}s</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                    disabled={uploading}
                    className="w-full accent-primary disabled:opacity-50"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{min}s</span>
                    <span>{max}s</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Error ── */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Submit ── */}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Annuler
            </button>
            <Button
              type="submit"
              className="h-9 min-w-32"
              disabled={!file || actions.size === 0 || uploading}
            >
              {uploading ? "Upload en cours…" : "Analyser la démo"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
