import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/src/lib/supabase/server"
import { ReferenceService } from "@/src/services/reference.service"
import { checkRateLimit } from "@/src/lib/rate-limit"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const levelId = searchParams.get("level_id") ?? undefined

  const supabase = await createClient()
  const service = new ReferenceService(supabase)

  try {
    const series = await service.getSeries(levelId)
    return NextResponse.json(series)
  } catch (err) {
    console.error("Error fetching series:", err)
    return NextResponse.json({ error: "Erreur lors du chargement des séries." }, { status: 500 })
  }
}
