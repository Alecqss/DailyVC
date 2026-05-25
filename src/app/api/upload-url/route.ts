import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,  // Requis pour Cloudflare R2 — évite le virtual-hosted style qui génère des URLs malformées
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  // ── Params ────────────────────────────────────────────────────────────────
  const { filename } = await req.json()
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename manquant" }, { status: 400 })
  }

  // Sanitize filename — keep only safe chars
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
  const key      = `${user.id}/${Date.now()}_${safeName}`

  // ── Presigned URL (PUT, expire 1h) ────────────────────────────────────────
  const command = new PutObjectCommand({
    Bucket:      process.env.R2_BUCKET_DEMOS!,
    Key:         key,
    ContentType: "application/octet-stream",
  })

  const url = await getSignedUrl(r2, command, { expiresIn: 3600 })

  return NextResponse.json({ url, key })
}
