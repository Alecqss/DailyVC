"use client"

import dynamic from "next/dynamic"

const HomeContent = dynamic(() => import("./home-content"), { ssr: false })

export default function Page() {
  return <HomeContent />
}
