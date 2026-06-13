import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/src/lib/supabase/server"
import { ReferenceService } from "@/src/services/reference.service"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const classId = searchParams.get("class_id") ?? undefined
  const className = searchParams.get("class_name") ?? undefined

  const supabase = await createClient()
  const service = new ReferenceService(supabase)

  try {
    const coefficients = await service.getCoefficients(classId, className)
    return NextResponse.json(coefficients)
  } catch (err) {
    logger.error({ err }, "Error fetching coefficients")
    return NextResponse.json({ error: "Erreur lors du chargement des coefficients." }, { status: 500 })
  }
}
