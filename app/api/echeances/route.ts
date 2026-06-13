import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/src/lib/supabase/server"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { EcheanceService } from "@/src/services/echeance.service"

export const runtime = "nodejs"

const createSchema = z.object({
  subject: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  echeance_type: z.enum(["devoir", "examen", "composition", "projet"]),
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

  const { searchParams } = new URL(request.url)
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "14") || 14, 1), 90)

  try {
    const service = new EcheanceService(supabase)
    const echeances = await service.getUpcoming(user.id, days)
    return NextResponse.json(echeances)
  } catch (err) {
    console.error("Error fetching echeances:", err)
    return NextResponse.json({ error: "Erreur lors du chargement des échéances." }, { status: 500 })
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

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const service = new EcheanceService(supabase)
    const echeance = await service.create({ ...parsed.data, user_id: user.id })
    return NextResponse.json(echeance, { status: 201 })
  } catch (err) {
    console.error("Error creating echeance:", err)
    return NextResponse.json({ error: "Erreur lors de la création de l'échéance." }, { status: 500 })
  }
}
