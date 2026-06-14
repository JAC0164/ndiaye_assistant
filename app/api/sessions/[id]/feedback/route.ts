import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import type { ExtractedTimetable } from "@/src/types/planning.types"
import { withAuth } from "@/src/lib/api-middleware"
import { HistoriqueService } from "@/src/services/historique.service"
import { SessionService } from "@/src/services/session.service"
import { ProfileService } from "@/src/services/profile.service"
import { RescheduleService } from "@/src/services/reschedule.service"
import { FULL_DAY_LABELS } from "@/src/lib/planning/constants"
import { logger } from "@/src/lib/logger"
import type { SupabaseClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const feedbackSchema = z.object({
  completed: z.boolean(),
  ressenti: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  duree_reelle_min: z.number().int().min(0).max(180).optional(),
})

async function handleReschedule(
  supabase: SupabaseClient,
  userId: string,
  historiqueId: string
): Promise<NextResponse | null> {
  const historiqueService = new HistoriqueService(supabase)
  const historiqueRow = await historiqueService.getById(historiqueId)
  if (!historiqueRow || !historiqueRow.session_id) return null

  const sessionService = new SessionService(supabase)
  const sessionRow = await sessionService.getById(historiqueRow.session_id)
  if (!sessionRow) return null

  const profileService = new ProfileService(supabase)
  const profile = await profileService.getByUserId(userId)
  if (!profile?.metadata) return null

  const meta = profile.metadata as Record<string, unknown>
  const cachedTimetable = meta.cachedExtractedTimetable
  if (typeof cachedTimetable !== "string") return null

  const bedtime = (meta.bedtime as string) || "22:00"
  const blockedSlots =
    (meta.blockedSlots as Array<{
      id: string
      day: string
      startTime: string
      endTime: string
      reason: string
    }>) || []

  let timetable: unknown
  try {
    timetable = JSON.parse(cachedTimetable)
  } catch {
    logger.error("Failed to parse cached timetable for reschedule")
    return null
  }

  const nextSlot = await RescheduleService.findNextSlot(supabase, {
    userId,
    missedSession: {
      id: historiqueRow.id,
      sessionId: historiqueRow.session_id,
      subject: historiqueRow.subject ?? "",
      sessionType: historiqueRow.session_type,
      pedagogicalNote: sessionRow.pedagogical_note ?? "",
      dayOfWeek: sessionRow.day_of_week,
      endTime: sessionRow.end_time,
    },
    timetable: timetable as ExtractedTimetable,
    bedtime,
    blockedSlots: blockedSlots.map((b) => ({
      id: b.id,
      day: b.day as "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
      startTime: b.startTime,
      endTime: b.endTime,
      reason: b.reason,
    })),
  })

  if (!nextSlot) {
    return NextResponse.json({
      ok: true,
      rescheduled: false,
      message:
        "Planning trop chargé pour replacer cette séance cette semaine. Elle sera priorisée la semaine prochaine.",
    })
  }

  await RescheduleService.createRescheduledRow(supabase, {
    userId,
    originalHistoriqueId: historiqueRow.id,
    subject: historiqueRow.subject ?? "",
    sessionType: historiqueRow.session_type,
    pedagogicalNote: sessionRow.pedagogical_note ?? "",
    targetSlot: nextSlot,
  })

  const dayFr = FULL_DAY_LABELS[nextSlot.day] ?? nextSlot.day
  return NextResponse.json({
    ok: true,
    rescheduled: true,
    message: `Séance repoussée au ${dayFr} à ${nextSlot.start}`,
  })
}

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

  const parsed = feedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const feedback = parsed.data

  try {
    const historiqueService = new HistoriqueService(supabase)
    await historiqueService.saveFeedback(id, user.id, feedback)

    if (!feedback.completed) {
      const rescheduleResponse = await handleReschedule(supabase, user.id, id)
      if (rescheduleResponse) return rescheduleResponse
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err }, "Error saving session feedback")
    return NextResponse.json({ error: "Erreur lors de l'enregistrement du feedback." }, { status: 500 })
  }
}
