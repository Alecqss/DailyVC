"use client"

import dynamic from "next/dynamic"

const UploadContent = dynamic(() => import("./upload-content"), { ssr: false })

export default function UploadPage() {
  return <UploadContent />
}
