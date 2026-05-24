"use client"

import dynamic from "next/dynamic"

const ClipsContent = dynamic(() => import("./clips-content"), { ssr: false })

export default function ClipsPage() {
  return <ClipsContent />
}
