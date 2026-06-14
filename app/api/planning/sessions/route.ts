import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/src/lib/api-middleware"
import { SessionService } from "@/src/services/session.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

  try {
    const service = new SessionService(supabase)
    const sessions = await service.getWeeklyTemplate(user.id)
    return NextResponse.json(sessions, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (err) {
    logger.error({ err }, "Error fetching sessions")
    return NextResponse.json({ error: "Erreur lors du chargement des séances." }, { status: 500 })
  }
}
