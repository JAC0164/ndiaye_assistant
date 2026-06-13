import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/src/lib/supabase/server"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { SessionService } from "@/src/services/session.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
  }

  try {
    const service = new SessionService(supabase)
    const sessions = await service.getWeeklyTemplate(user.id)
    return NextResponse.json(sessions)
  } catch (err) {
    logger.error({ err }, "Error fetching sessions")
    return NextResponse.json({ error: "Erreur lors du chargement des séances." }, { status: 500 })
  }
}
