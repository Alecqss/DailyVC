"use client"

import { useState, useEffect } from "react"
import { type User } from "@supabase/supabase-js"
import { AuthModal, type AuthMode } from "@/components/auth-modal"
import { supabase } from "@/lib/supabase"

export default function Home() {
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>("signin")
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  return (
    <>
      <div className="min-h-screen bg-background font-sans text-foreground">
        {/* Header */}
        <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <span className="text-sm font-semibold tracking-tight">DailyVC</span>

            <nav className="flex items-center gap-3">
              {user ? (
                <>
                  {/* Connected state */}
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    <span className="text-sm font-medium text-foreground">Connecté</span>
                  </div>
                  <button
                    onClick={() => supabase.auth.signOut()}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Se déconnecter
                  </button>
                </>
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

        {/* Hero */}
        <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <div className="max-w-2xl">
            <span className="inline-block rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Deal flow management
            </span>
            <h1 className="mt-5 text-5xl font-bold tracking-tight sm:text-6xl">
              Track every deal.
              <br />
              <span className="text-muted-foreground">Close what matters.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              DailyVC helps investors manage their pipeline, collaborate with partners,
              and never miss a critical follow-up.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <button
                onClick={() => openAuth("signup")}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-80"
              >
                Start for free
              </button>
              <button
                onClick={() => openAuth("signin")}
                className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Sign in
              </button>
            </div>
          </div>
        </main>
      </div>

      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        mode={authMode}
        onModeChange={setAuthMode}
      />
    </>
  )
}
