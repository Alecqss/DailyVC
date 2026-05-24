"use client"

import dynamic from "next/dynamic"

const DashboardContent = dynamic(() => import("./dashboard-content"), { ssr: false })

export default function DashboardPage() {
  return <DashboardContent />
}
