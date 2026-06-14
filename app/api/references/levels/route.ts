import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/src/lib/api-middleware"
import { ReferenceService } from "@/src/services/reference.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

  const service = new ReferenceService(supabase)

  try {
    const levels = await service.getLevels()
    return NextResponse.json(levels, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (err) {
    logger.error({ err }, "Error fetching levels")
    return NextResponse.json({ error: "Erreur lors du chargement des niveaux." }, { status: 500 })
  }
}
