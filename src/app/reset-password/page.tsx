"use client"

import dynamic from "next/dynamic"

const ResetContent = dynamic(() => import("./reset-content"), { ssr: false })

export default function Page() {
  return <ResetContent />
}
