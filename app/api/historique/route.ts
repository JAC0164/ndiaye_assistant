import { withAuth } from "@/src/lib/api-middleware"
import { logger } from "@/src/lib/logger"
import { HistoriqueService } from "@/src/services/historique.service"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

  try {
    const service = new HistoriqueService(supabase)
    const stats = await service.getWeeklyStats(user.id)
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (err) {
    logger.error({ err }, "Error fetching historique")
    return NextResponse.json({ error: "Erreur lors du chargement de l'historique." }, { status: 500 })
  }
}
