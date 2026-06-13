import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/src/lib/supabase/server"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { HistoriqueService } from "@/src/services/historique.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

const logSchema = z.object({
  session_id: z.string().uuid().optional().nullable(),
  subject: z.string().min(1),
  session_type: z.enum(["td", "review", "break"]),
  duration_minutes: z.number().int().min(1).max(600).optional().nullable(),
  self_rating: z.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().optional().nullable(),
})

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
    const service = new HistoriqueService(supabase)
    const stats = await service.getWeeklyStats(user.id)
    return NextResponse.json(stats)
  } catch (err) {
    logger.error({ err }, "Error fetching historique")
    return NextResponse.json({ error: "Erreur lors du chargement de l'historique." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 })
  }

  const parsed = logSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const service = new HistoriqueService(supabase)
    const log = await service.logCompletion({ ...parsed.data, user_id: user.id })
    return NextResponse.json(log, { status: 201 })
  } catch (err) {
    logger.error({ err }, "Error logging historique")
    return NextResponse.json({ error: "Erreur lors de l'enregistrement." }, { status: 500 })
  }
}
