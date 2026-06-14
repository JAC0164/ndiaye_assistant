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
  const classId = searchParams.get("class_id") ?? undefined
  const className = searchParams.get("class_name") ?? undefined

  const service = new ReferenceService(supabase)

  try {
    const coefficients = await service.getCoefficients(classId, className)
    return NextResponse.json(coefficients, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (err) {
    logger.error({ err }, "Error fetching coefficients")
    return NextResponse.json({ error: "Erreur lors du chargement des coefficients." }, { status: 500 })
  }
}
