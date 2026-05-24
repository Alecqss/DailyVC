"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Zap } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CRITERIA, PasswordStrength } from "@/components/auth-modal"
import { cn } from "@/lib/utils"

type Step = "waiting" | "form" | "success" | "invalid"

export default function ResetContent() {
  const router  = useRouter()
  const [step, setStep]         = useState<Step>("waiting")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm]   = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStep("form")
    })

    const timer = setTimeout(() => {
      setStep((s) => s === "waiting" ? "invalid" : s)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.")
      return
    }
    const allMet = CRITERIA.every((c) => c.test(password))
    if (!allMet) {
      setError("Le mot de passe ne remplit pas tous les critères.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setStep("success")
      setTimeout(() => router.push("/dashboard"), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" fill="currentColor" />
          </div>
          <span className="text-sm font-bold">
            Highlight<span className="text-primary">.gg</span>
          </span>
        </div>

        {step === "waiting" && (
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            <p className="text-sm text-muted-foreground">Validation du lien…</p>
          </div>
        )}

        {step === "invalid" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4">
            <p className="text-sm font-medium text-destructive">Lien invalide ou expiré</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Demande un nouveau lien depuis la page de connexion.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-3 text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              Retour à l'accueil
            </button>
          </div>
        )}

        {step === "success" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-900/30">
              <Check className="h-6 w-6 text-green-400" />
            </div>
            <h2 className="text-base font-semibold">Mot de passe mis à jour</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Redirection vers le dashboard…
            </p>
          </div>
        )}

        {step === "form" && (
          <>
            <h1 className="mb-1 text-xl font-semibold">Nouveau mot de passe</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Choisis un mot de passe sécurisé pour ton compte.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">Nouveau mot de passe</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              {password.length > 0 && <PasswordStrength password={password} />}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                {confirm.length > 0 && password !== confirm && (
                  <p className={cn("text-xs", "text-destructive")}>
                    Les mots de passe ne correspondent pas.
                  </p>
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="h-9 w-full"
                disabled={loading || (confirm.length > 0 && password !== confirm)}
              >
                {loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
              </Button>
            </form>
          </>
        )}

      </div>
    </div>
  )
}
