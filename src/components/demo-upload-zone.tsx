"use client"

import { useRef, useState, useCallback } from "react"
import { Upload, FileVideo, X, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface DemoUploadZoneProps {
  onFileSelect: (file: File) => void
  selectedFile: File | null
  onClear: () => void
  disabled?: boolean
  className?: string
}

const MAX_SIZE_MB = 500
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DemoUploadZone({
  onFileSelect,
  selectedFile,
  onClear,
  disabled = false,
  className,
}: DemoUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = useCallback((file: File): string | null => {
    if (!file.name.endsWith(".dem")) {
      return "Le fichier doit être au format .dem (démo CS2)."
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `Le fichier ne doit pas dépasser ${MAX_SIZE_MB} MB.`
    }
    return null
  }, [])

  const handleFile = useCallback(
    (file: File) => {
      const err = validate(file)
      if (err) {
        setError(err)
        return
      }
      setError(null)
      onFileSelect(file)
    },
    [validate, onFileSelect]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // reset input so same file can be re-selected
    e.target.value = ""
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  if (selectedFile) {
    return (
      <div
        className={cn(
          "flex items-center gap-4 rounded-xl border border-primary/40 bg-primary/5 p-4",
          className
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileVideo className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Supprimer</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => !disabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        disabled={disabled}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-primary/5",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isDragging ? "Dépose ici ton fichier .dem" : "Glisse & dépose ton fichier .dem"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ou <span className="text-primary underline-offset-2 hover:underline">parcourir</span>
            {" "}· max {MAX_SIZE_MB} MB
          </p>
        </div>
      </button>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".dem"
        onChange={handleInputChange}
        className="sr-only"
      />
    </div>
  )
}
