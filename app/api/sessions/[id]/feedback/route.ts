import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/src/lib/supabase/server"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { HistoriqueService } from "@/src/services/historique.service"
import { ProfileService } from "@/src/services/profile.service"
import { RescheduleService, RescheduleSessionInfo } from "@/src/services/reschedule.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

const feedbackSchema = z.object({
  completed: z.boolean(),
  ressenti: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  duree_reelle_min: z.number().int().min(0).max(180).optional(),
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

  const parsed = feedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const feedback = parsed.data

  try {
    const historiqueService = new HistoriqueService(supabase)
    await historiqueService.saveFeedback(id, user.id, feedback)

    if (!feedback.completed) {
      // Fetch the historique row to get session_id and details
      const { data: historiqueRow } = await supabase
        .from("historique")
        .select("id, session_id, subject, session_type, pedagogical_note, completed_at")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()

      if (historiqueRow && historiqueRow.session_id) {
        // Fetch the original session details for timing info
        const { data: sessionRow } = await supabase
          .from("sessions")
          .select("day_of_week, start_time, end_time")
          .eq("id", historiqueRow.session_id)
          .single()

        if (sessionRow) {
          // Fetch profile to get timetable, bedtime, blocked slots
          const profileService = new ProfileService(supabase)
          const profile = await profileService.getByUserId(user.id)

          if (profile?.metadata) {
            const meta = profile.metadata as Record<string, unknown>
            const cachedTimetable = meta.cachedExtractedTimetable
            const bedtime = (meta.bedtime as string) || "22:00"
            const blockedSlots =
              (meta.blockedSlots as Array<{
                id: string
                day: string
                startTime: string
                endTime: string
                reason: string
              }>) || []

            if (cachedTimetable && typeof cachedTimetable === "string") {
              try {
                const timetable = JSON.parse(cachedTimetable)
                const missedSession: RescheduleSessionInfo = {
                  id: historiqueRow.id,
                  sessionId: historiqueRow.session_id,
                  subject: historiqueRow.subject,
                  sessionType: historiqueRow.session_type,
                  pedagogicalNote: historiqueRow.pedagogical_note || "",
                  dayOfWeek: sessionRow.day_of_week,
                  endTime: sessionRow.end_time,
                }

                const nextSlot = await RescheduleService.findNextSlot(supabase, {
                  userId: user.id,
                  missedSession,
                  timetable,
                  bedtime,
                  blockedSlots: blockedSlots.map((b) => ({
                    id: b.id,
                    day: b.day as "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
                    startTime: b.startTime,
                    endTime: b.endTime,
                    reason: b.reason,
                  })),
                })

                if (nextSlot) {
                  await RescheduleService.createRescheduledRow(supabase, {
                    userId: user.id,
                    originalHistoriqueId: historiqueRow.id,
                    subject: historiqueRow.subject,
                    sessionType: historiqueRow.session_type,
                    pedagogicalNote: historiqueRow.pedagogical_note || "",
                    targetSlot: nextSlot,
                  })

                  const FRENCH_DAYS: Record<string, string> = {
                    monday: "Lundi",
                    tuesday: "Mardi",
                    wednesday: "Mercredi",
                    thursday: "Jeudi",
                    friday: "Vendredi",
                    saturday: "Samedi",
                    sunday: "Dimanche",
                  }
                  const dayFr = FRENCH_DAYS[nextSlot.day] ?? nextSlot.day

                  return NextResponse.json({
                    ok: true,
                    rescheduled: true,
                    message: `Séance repoussée au ${dayFr} à ${nextSlot.start}`,
                  })
                }

                return NextResponse.json({
                  ok: true,
                  rescheduled: false,
                  message:
                    "Planning trop chargé pour replacer cette séance cette semaine. Elle sera priorisée la semaine prochaine.",
                })
              } catch (parseErr) {
                logger.error({ err: parseErr }, "Failed to parse cached timetable for reschedule")
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ err }, "Error saving session feedback")
    return NextResponse.json({ error: "Erreur lors de l'enregistrement du feedback." }, { status: 500 })
  }
}
