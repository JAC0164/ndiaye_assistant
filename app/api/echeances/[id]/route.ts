import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/src/lib/api-middleware"
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
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

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
    const echeance = await service.update(id, user.id, { ...parsed.data, updated_at: new Date().toISOString() })
    return NextResponse.json(echeance, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (err) {
    logger.error({ err }, "Error updating echeance")
    return NextResponse.json({ error: "Erreur lors de la mise à jour de l'échéance." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

  const { id } = await params

  try {
    const service = new EcheanceService(supabase)
    await service.delete(id, user.id)
    return NextResponse.json(
      { success: true },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    )
  } catch (err) {
    logger.error({ err }, "Error deleting echeance")
    return NextResponse.json({ error: "Erreur lors de la suppression de l'échéance." }, { status: 500 })
  }
}
