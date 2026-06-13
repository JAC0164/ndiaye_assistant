import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/src/lib/supabase/server"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { EcheanceService } from "@/src/services/echeance.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

const updateSchema = z.object({
  subject: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  echeance_type: z.enum(["devoir", "examen", "composition", "projet"]).optional(),
  is_completed: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const service = new EcheanceService(supabase)
    const echeance = await service.update(id, { ...parsed.data, updated_at: new Date().toISOString() })
    return NextResponse.json(echeance)
  } catch (err) {
    logger.error({ err }, "Error updating echeance")
    return NextResponse.json({ error: "Erreur lors de la mise à jour de l'échéance." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params

  try {
    const service = new EcheanceService(supabase)
    await service.delete(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ err }, "Error deleting echeance")
    return NextResponse.json({ error: "Erreur lors de la suppression de l'échéance." }, { status: 500 })
  }
}
