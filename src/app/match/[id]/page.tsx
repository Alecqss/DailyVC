"use client"

import dynamic from "next/dynamic"

const MatchContent = dynamic(() => import("./match-content"), { ssr: false })

export default function MatchPage() {
  return <MatchContent />
}
