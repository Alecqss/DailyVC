"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { Demo, Clip } from "@/lib/types"

/**
 * Subscribe to realtime updates for a single demo row.
 * Returns the latest demo state (or null while loading).
 */
export function useDemoRealtime(demoId: string | null) {
  const [demo, setDemo] = useState<Demo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!demoId) {
      setLoading(false)
      return
    }

    // Initial fetch (async/await to avoid PromiseLike TS issue)
    const fetchDemo = async () => {
      try {
        const { data } = await supabase
          .from("demos")
          .select("*")
          .eq("id", demoId)
          .single()
        if (data) setDemo(data as Demo)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchDemo()

    // Subscribe to row-level changes
    const channel = supabase
      .channel(`demo-status:${demoId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "demos",
          filter: `id=eq.${demoId}`,
        },
        (payload) => {
          setDemo(payload.new as Demo)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [demoId])

  return { demo, loading }
}

/**
 * Subscribe to all demos belonging to the current user.
 */
export function useUserDemos(userId: string | null) {
  const [demos, setDemos] = useState<Demo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const fetchDemos = async () => {
      try {
        const { data } = await supabase
          .from("demos")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
        setDemos((data as Demo[]) ?? [])
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchDemos()

    const refetch = async () => {
      try {
        const { data } = await supabase
          .from("demos")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
        setDemos((data as Demo[]) ?? [])
      } catch {
        // ignore
      }
    }

    const channel = supabase
      .channel(`user-demos:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "demos",
          filter: `user_id=eq.${userId}`,
        },
        () => { refetch() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return { demos, loading }
}

/**
 * Subscribe to all clips belonging to the current user.
 * Used to display per-highlight clip state ('pending' / 'rendering' / 'done').
 */
export function useUserClips(userId: string | null) {
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const refetch = async () => {
      try {
        const { data } = await supabase
          .from("clips")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
        setClips((data as Clip[]) ?? [])
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    refetch()

    const channel = supabase
      .channel(`user-clips:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clips",
          filter: `user_id=eq.${userId}`,
        },
        () => { refetch() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return { clips, loading }
}
