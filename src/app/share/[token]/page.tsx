"use client"

import dynamic from "next/dynamic"

const ShareContent = dynamic(() => import("./share-content"), { ssr: false })

export default function SharePage() {
  return <ShareContent />
}
