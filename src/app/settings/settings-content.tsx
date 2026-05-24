"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { type User } from "@supabase/supabase-js"
import { Check, AlertCircle, Loader2, Zap } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Profile } from "@/lib/types"

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <div className="sm:w-56 sm:shrink-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsContent() {
  const router = useRouter()
  const [user, setUser]         = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [profile, setProfile]   = useState<Profile | null>(null)

  // CS2 username form
  const [cs2Username, setCs2Username] = useState("")
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // Notification preferences
  const [notifEmail, setNotifEmail] = useState(true)

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

  // Load profile
  useEffect(() => {
    if (!user) return
    const fetchProfile = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()
        if (data) {
          const p = data as Profile
          setProfile(p)
          setCs2Username(p.cs2_username ?? "")
          setNotifEmail(p.notify_email ?? true)
        }
      } catch {
        // no profile yet — that's fine
      }
    }
    fetchProfile()
  }, [user])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id:           user.id,
          cs2_username: cs2Username.trim() || null,
          notify_email: notifEmail,
        })

      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.")
    } finally {
      setSaving(false)
    }
  }

  if (checking) return null

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gère ton profil et tes préférences.
          </p>
        </div>

        <div className="flex flex-col divide-y divide-border">

          {/* ── CS2 Username ── */}
          <div className="py-8">
            <Section
              title="Pseudo CS2"
              description="Ton pseudo est utilisé pour t'identifier dans les démos. Il doit correspondre exactement à ton nom in-game."
            >
              <form onSubmit={saveProfile} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cs2-username">Pseudo in-game</Label>
                  <Input
                    id="cs2-username"
                    type="text"
                    placeholder="ex: s1mple"
                    value={cs2Username}
                    onChange={(e) => setCs2Username(e.target.value)}
                    disabled={saving}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sensible à la casse · Visible dans les stats de ta démo.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button type="submit" className="h-9" disabled={saving}>
                    {saving ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sauvegarde…</>
                    ) : "Sauvegarder"}
                  </Button>
                  {saved && (
                    <span className="flex items-center gap-1 text-sm text-green-500">
                      <Check className="h-4 w-4" />
                      Sauvegardé
                    </span>
                  )}
                </div>
              </form>
            </Section>
          </div>

          {/* ── Notifications ── */}
          <div className="py-8">
            <Section
              title="Notifications"
              description="Choisis quand et comment tu souhaites être notifié."
            >
              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Email quand c'est prêt</p>
                  <p className="text-xs text-muted-foreground">
                    Reçois un email quand tes clips sont générés.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifEmail}
                  onClick={() => setNotifEmail((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    notifEmail ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      notifEmail ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </Section>
          </div>

          {/* ── Plan ── */}
          <div className="py-8">
            <Section
              title="Plan actuel"
              description="Ton abonnement et tes limites."
            >
              <div className="flex items-start gap-4 rounded-xl border border-border bg-secondary/40 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Freemium</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Accès gratuit · Analyse jusqu'à 3 démos/mois
                  </p>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Actif
                </span>
              </div>
            </Section>
          </div>

          {/* ── Account ── */}
          <div className="py-8">
            <Section title="Compte" description="Informations liées à ton compte.">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Adresse email</Label>
                  <Input
                    type="email"
                    value={user?.email ?? ""}
                    disabled
                    className="opacity-60"
                  />
                </div>
                <button
                  onClick={() =>
                    supabase.auth.signOut().then(() => router.push("/"))
                  }
                  className="w-fit text-sm font-medium text-destructive underline-offset-2 hover:underline"
                >
                  Se déconnecter
                </button>
              </div>
            </Section>
          </div>

        </div>
      </div>
    </AppShell>
  )
}
