"use client"

import { useState } from "react"
import { XIcon, Check, ChevronLeft } from "lucide-react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

export type AuthMode = "signin" | "signup" | "forgot"

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
}

// ─── Geometric art panel ─────────────────────────────────────────────────────

function GeometricPanel() {
  return (
    <div className="relative hidden sm:flex flex-col overflow-hidden rounded-l-xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99,102,241,0.18) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.18) 1px, transparent 1px)
          `,
          backgroundSize: "36px 36px",
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 340 520"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <circle cx="170" cy="220" r="165" stroke="rgba(99,102,241,0.10)" strokeWidth="1" />
        <circle cx="170" cy="220" r="125" stroke="rgba(139,92,246,0.18)" strokeWidth="1" />
        <circle cx="170" cy="220" r="85"  stroke="rgba(99,102,241,0.28)" strokeWidth="1" />
        <circle cx="170" cy="220" r="45"  stroke="rgba(139,92,246,0.45)" strokeWidth="1" />
        <polygon points="170,118 243,162 243,248 170,292 97,248 97,162" stroke="rgba(139,92,246,0.32)" strokeWidth="1" />
        <line x1="5"   y1="220" x2="335" y2="220" stroke="rgba(99,102,241,0.12)" strokeWidth="1" />
        <line x1="170" y1="55"  x2="170" y2="385" stroke="rgba(99,102,241,0.12)" strokeWidth="1" />
        <line x1="25"  y1="75"  x2="315" y2="365" stroke="rgba(99,102,241,0.08)" strokeWidth="1" />
        <line x1="315" y1="75"  x2="25"  y2="365" stroke="rgba(99,102,241,0.08)" strokeWidth="1" />
        <circle cx="55"  cy="95"  r="32" stroke="rgba(139,92,246,0.13)" strokeWidth="1" />
        <circle cx="300" cy="95"  r="22" stroke="rgba(99,102,241,0.18)" strokeWidth="1" />
        <circle cx="285" cy="330" r="48" stroke="rgba(139,92,246,0.10)" strokeWidth="1" />
        <polygon points="265,385 315,465 215,465" stroke="rgba(139,92,246,0.22)" strokeWidth="1" />
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => (
            <circle key={`${row}-${col}`} cx={38 + col * 22} cy={388 + row * 22} r="1.5" fill="rgba(139,92,246,0.38)" />
          ))
        )}
        <circle cx="170" cy="220" r="5.5" fill="rgba(139,92,246,0.95)" />
        <circle cx="243" cy="162" r="3"   fill="rgba(99,102,241,0.70)" />
        <circle cx="243" cy="248" r="3"   fill="rgba(99,102,241,0.70)" />
        <circle cx="170" cy="292" r="3"   fill="rgba(99,102,241,0.70)" />
        <circle cx="97"  cy="248" r="3"   fill="rgba(99,102,241,0.70)" />
        <circle cx="97"  cy="162" r="3"   fill="rgba(99,102,241,0.70)" />
        <circle cx="170" cy="118" r="3"   fill="rgba(99,102,241,0.70)" />
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 180px 180px at 50% 42%, rgba(99,102,241,0.14) 0%, transparent 70%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-slate-900/90 to-transparent" />
      <div className="absolute bottom-8 left-6 right-6">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500">
            <span className="text-[8px] font-bold text-white">VC</span>
          </div>
          <span className="text-sm font-semibold text-white">DailyVC</span>
        </div>
        <p className="text-[11px] leading-relaxed text-white/40">
          Track every deal.<br />Close what matters.
        </p>
      </div>
    </div>
  )
}

// ─── Password strength ────────────────────────────────────────────────────────

export const CRITERIA = [
  { label: "8 caractères", test: (p: string) => p.length >= 8 },
  { label: "1 majuscule",  test: (p: string) => /[A-Z]/.test(p) },
  { label: "1 minuscule",  test: (p: string) => /[a-z]/.test(p) },
  { label: "1 chiffre",    test: (p: string) => /[0-9]/.test(p) },
]

export function PasswordStrength({ password }: { password: string }) {
  const results = CRITERIA.map((c) => ({ ...c, met: c.test(password) }))
  const count   = results.filter((r) => r.met).length

  const barColor   = count === 4 ? "bg-green-500" : count >= 2 ? "bg-amber-500" : "bg-red-500"
  const label      = count === 4 ? "Fort"         : count >= 2 ? "Moyen"        : "Faible"
  const labelColor = count === 4 ? "text-green-600 dark:text-green-400"
                   : count >= 2  ? "text-amber-600 dark:text-amber-400"
                   :               "text-red-500"

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-300", barColor)}
            style={{ width: `${(count / 4) * 100}%` }}
          />
        </div>
        <span className={cn("w-10 text-right text-xs font-medium", labelColor)}>
          {label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {results.map((r) => (
          <div
            key={r.label}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              r.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            )}
          >
            <div
              className={cn(
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-colors",
                r.met ? "bg-green-100 dark:bg-green-900/40" : "bg-muted"
              )}
            >
              {r.met
                ? <Check className="h-2.5 w-2.5" strokeWidth={3} />
                : <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              }
            </div>
            {r.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentedControl({ mode, onChange }: { mode: AuthMode; onChange: (m: AuthMode) => void }) {
  return (
    <div className="flex rounded-lg bg-muted p-1">
      {(["signin", "signup"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "flex-1 rounded-md py-1.5 text-sm font-medium transition-all duration-150",
            mode === m
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "signin" ? "Se connecter" : "S'inscrire"}
        </button>
      ))}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function AuthModal({ open, onOpenChange, mode, onModeChange }: AuthModalProps) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName]   = useState("")
  const [email, setEmail]         = useState("")
  const [password, setPassword]   = useState("")
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<string | null>(null)

  const reset = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPassword("")
    setError(null); setSuccess(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const switchMode = (next: AuthMode) => {
    setError(null); setSuccess(null); onModeChange(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (mode === "signup") {
      const allMet = CRITERIA.every((c) => c.test(password))
      if (!allMet) {
        setError("Le mot de passe ne remplit pas tous les critères.")
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onOpenChange(false)
        reset()
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { first_name: firstName, last_name: lastName } },
        })
        if (error) throw error
        setSuccess("Vérifie ton email pour confirmer ton compte.")
      } else {
        // forgot
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setSuccess("Lien envoyé ! Vérifie ta boîte mail.")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl" showCloseButton={false}>
        <div className="grid min-h-[520px] sm:grid-cols-2">
          <GeometricPanel />

          {/* Form panel */}
          <div className="relative flex flex-col justify-center gap-5 p-8">
            {/* Close */}
            <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none">
              <XIcon className="h-4 w-4" />
              <span className="sr-only">Fermer</span>
            </DialogPrimitive.Close>

            {/* Logo */}
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-xs font-bold text-primary-foreground">VC</span>
            </div>

            {mode === "forgot" ? (
              /* ── Forgot password view ── */
              <>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Retour
                </button>

                <div>
                  <h2 className="text-base font-semibold text-foreground">Mot de passe oublié</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Saisis ton email, on t'envoie un lien de réinitialisation.
                  </p>
                </div>

                {success ? (
                  <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
                    {success}
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="forgot-email">Email</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="toi@fund.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <Button type="submit" className="h-9 w-full" disabled={loading}>
                      {loading ? "Envoi…" : "Envoyer le lien"}
                    </Button>
                  </form>
                )}
              </>
            ) : (
              /* ── Sign in / Sign up view ── */
              <>
                <SegmentedControl mode={mode} onChange={switchMode} />

                {success ? (
                  <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
                    {success}
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {mode === "signup" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="auth-firstname">Prénom</Label>
                          <Input
                            id="auth-firstname"
                            type="text"
                            placeholder="Jean"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            required
                            autoComplete="given-name"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="auth-lastname">Nom</Label>
                          <Input
                            id="auth-lastname"
                            type="text"
                            placeholder="Dupont"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            required
                            autoComplete="family-name"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="auth-email">Email</Label>
                      <Input
                        id="auth-email"
                        type="email"
                        placeholder="toi@fund.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="auth-password">Mot de passe</Label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            onClick={() => switchMode("forgot")}
                            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Mot de passe oublié ?
                          </button>
                        )}
                      </div>
                      <Input
                        id="auth-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      />
                    </div>

                    {mode === "signup" && password.length > 0 && (
                      <PasswordStrength password={password} />
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <Button type="submit" className="h-9 w-full" disabled={loading}>
                      {loading
                        ? "Chargement…"
                        : mode === "signin" ? "Se connecter" : "Créer mon compte"}
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
