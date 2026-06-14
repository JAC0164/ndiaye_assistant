import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/src/lib/api-middleware"
import { ReferenceService } from "@/src/services/reference.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

  const { searchParams } = new URL(request.url)
  const levelId = searchParams.get("level_id") ?? undefined

  const service = new ReferenceService(supabase)

  try {
    const series = await service.getSeries(levelId)
    return NextResponse.json(series, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (err) {
    logger.error({ err }, "Error fetching series")
    return NextResponse.json({ error: "Erreur lors du chargement des séries." }, { status: 500 })
  }
}
