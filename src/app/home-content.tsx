"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { type User } from "@supabase/supabase-js"
import { AuthModal, type AuthMode } from "@/components/auth-modal"
import { supabase } from "@/lib/supabase"
import { Zap, Upload, Cpu, Film, ArrowRight, ChevronDown } from "lucide-react"

// ── Mock highlight examples ───────────────────────────────────────────────────

const EXAMPLE_HIGHLIGHTS = [
  { type: "ACE",        map: "de_dust2",  color: "from-yellow-500/20 to-yellow-600/5",  badge: "bg-yellow-500/20 text-yellow-300", emoji: "🏆" },
  { type: "1v3 Clutch", map: "de_mirage", color: "from-orange-500/20 to-orange-600/5",  badge: "bg-orange-500/20 text-orange-300", emoji: "💪" },
  { type: "Triple Kill", map: "de_inferno",color: "from-primary/20 to-primary/5",        badge: "bg-primary/20 text-primary",        emoji: "🔥" },
] as const

// ── How it works steps ────────────────────────────────────────────────────────

const STEPS = [
  {
    n: "01",
    icon: Upload,
    title: "Upload ta démo",
    desc: "Après ton match, exporte le fichier .dem depuis CS2 et dépose-le sur Highlight.gg.",
  },
  {
    n: "02",
    icon: Cpu,
    title: "On analyse tout",
    desc: "Notre moteur parse chaque tick de ta démo et détecte tes meilleures actions automatiquement.",
  },
  {
    n: "03",
    icon: Film,
    title: "Télécharge tes clips",
    desc: "Chaque highlight est rendu en MP4 prêt à partager. Direct, sans montage.",
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeContent() {
  const router = useRouter()
  const [authOpen, setAuthOpen]   = useState(false)
  const [authMode, setAuthMode]   = useState<AuthMode>("signin")
  const [user, setUser]           = useState<User | null>(null)
  const [checking, setChecking]   = useState(true)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        setChecking(false)
      })
      .catch(() => { setUser(null); setChecking(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  if (checking) return null

  return (
    <>
      <div className="min-h-screen bg-background font-sans text-foreground">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
                <Zap className="h-4 w-4 text-primary-foreground" fill="currentColor" />
              </div>
              <span className="text-sm font-bold tracking-tight">
                Highlight<span className="text-primary">.gg</span>
              </span>
            </div>

            <nav className="flex items-center gap-3">
              {user ? (
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-80"
                >
                  Dashboard
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => openAuth("signin")}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => openAuth("signup")}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-80"
                  >
                    Get started
                  </button>
                </>
              )}
            </nav>
          </div>
        </header>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
          {/* Radial glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="h-[600px] w-[600px] rounded-full bg-primary/8 blur-3xl" />
          </div>

          <div className="relative max-w-3xl">
            {/* Badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              CS2 Highlight Generator
            </span>

            {/* Headline */}
            <h1 className="mt-6 text-5xl font-extrabold tracking-tight sm:text-7xl">
              Your best frags.
              <br />
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
                Automatically.
              </span>
            </h1>

            {/* Sub */}
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Upload ta démo CS2. On détecte tes multi-kills, clutchs et knife kills.
              Tu reçois des clips MP4 prêts à partager — sans OBS, sans montage.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => openAuth("signup")}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-80"
              >
                Start for free
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#how-it-works"
                className="rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Comment ça marche
              </a>
            </div>

            {/* Social proof */}
            <p className="mt-8 text-xs text-muted-foreground">
              Multi-kills · Clutchs · Knife kills · Clips MP4 · Liens de partage
            </p>
          </div>

          {/* Scroll hint */}
          <a
            href="#how-it-works"
            aria-label="Défiler"
            className="absolute bottom-8 animate-bounce text-muted-foreground/40 hover:text-muted-foreground"
          >
            <ChevronDown className="h-6 w-6" />
          </a>
        </section>

        {/* ── How it works ────────────────────────────────────────────────── */}
        <section id="how-it-works" className="border-t border-border/60 bg-secondary/30 px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mb-16 text-center">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                Comment ça marche
              </span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">3 étapes. Zéro friction.</h2>
              <p className="mx-auto mt-4 max-w-md text-muted-foreground">
                Highlight.gg s'occupe de tout — du parsing à la génération du clip.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-3">
              {STEPS.map(({ n, icon: Icon, title, desc }) => (
                <div key={n} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-4xl font-black text-border">{n}</span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Example clips ───────────────────────────────────────────────── */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                Exemples de clips
              </span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Tes highlights, automatisés</h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              {EXAMPLE_HIGHLIGHTS.map(({ type, map, color, badge, emoji }) => (
                <div
                  key={type}
                  className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${color} p-px`}
                >
                  <div className="flex flex-1 flex-col rounded-2xl bg-secondary/70 p-5">
                    {/* Fake video thumbnail */}
                    <div className="mb-4 flex aspect-video items-center justify-center rounded-xl bg-muted/50 text-4xl">
                      {emoji}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${badge}`}>
                        {type}
                      </span>
                      <span className="text-xs text-muted-foreground">{map}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-12 flex flex-col items-center gap-4 text-center">
              <p className="text-muted-foreground">Prêt à voir tes propres highlights ?</p>
              <button
                onClick={() => openAuth("signup")}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-80"
              >
                Créer mon compte gratuitement
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="border-t border-border/60 px-6 py-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-primary">
                <Zap className="h-3 w-3 text-primary-foreground" fill="currentColor" />
              </div>
              <span className="text-xs font-bold text-muted-foreground">
                Highlight<span className="text-primary">.gg</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Highlight.gg · Tous droits réservés
            </p>
          </div>
        </footer>
      </div>

      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        mode={authMode}
        onModeChange={setAuthMode}
        onSuccess={() => router.push("/dashboard")}
      />
    </>
  )
}
