// ── Highlight.gg — shared types ───────────────────────────────────────────────

export type DemoStatus = "uploaded" | "parsing" | "rendering" | "done" | "error"

export type HighlightType =
  | "multikill_2k"
  | "multikill_3k"
  | "multikill_4k"
  | "multikill_ace"
  | "clutch_1v1"
  | "clutch_1v2"
  | "clutch_1v3"
  | "clutch_1v4"
  | "clutch_1v5"
  | "knife"

export interface Profile {
  id: string
  cs2_username: string | null
  created_at: string
}

export interface Demo {
  id: string
  user_id: string
  filename: string
  storage_path: string
  status: DemoStatus
  progress: number
  map_name: string | null
  match_date: string | null
  created_at: string
}

export interface Highlight {
  id: string
  demo_id: string
  type: HighlightType
  tick_start: number
  tick_end: number
  round: number
  kills: number
  created_at: string
}

export interface Clip {
  id: string
  highlight_id: string
  user_id: string
  storage_path: string
  share_token: string
  is_public: boolean
  duration_sec: number
  created_at: string
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const HIGHLIGHT_LABELS: Record<HighlightType, string> = {
  multikill_2k:  "Double Kill",
  multikill_3k:  "Triple Kill",
  multikill_4k:  "Quadro Kill",
  multikill_ace: "ACE",
  clutch_1v1:    "1v1 Clutch",
  clutch_1v2:    "1v2 Clutch",
  clutch_1v3:    "1v3 Clutch",
  clutch_1v4:    "1v4 Clutch",
  clutch_1v5:    "1v5 Clutch",
  knife:         "Knife Kill",
}

export const DEMO_STATUS_LABELS: Record<DemoStatus, string> = {
  uploaded:  "En attente",
  parsing:   "Analyse en cours…",
  rendering: "Génération des clips…",
  done:      "Terminé",
  error:     "Erreur",
}
