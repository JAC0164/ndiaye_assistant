import { SupabaseClient } from "@supabase/supabase-js"
import { ExtractedTimetable, BlockedSlot, FreeSlot } from "@/src/types/planning.types"
import { buildFreeSlots, parseTime } from "../lib/planning/buildFreeSlots"
import { DAY_ORDER } from "../lib/planning/constants"
import { logger } from "@/src/lib/logger"

export interface RescheduleSessionInfo {
  id: string
  sessionId: string | null
  subject: string
  sessionType: "td" | "review" | "break"
  pedagogicalNote: string
  dayOfWeek: string
  endTime: string
}

export class RescheduleService {
  static async findNextSlot(
    supabase: SupabaseClient,
    params: {
      userId: string
      missedSession: RescheduleSessionInfo
      timetable: ExtractedTimetable
      bedtime: string
      blockedSlots: BlockedSlot[]
    }
  ): Promise<FreeSlot | null> {
    const { userId, missedSession, timetable, bedtime, blockedSlots } = params

    const sessionDayIndex = DAY_ORDER[missedSession.dayOfWeek] ?? 0
    const sessionEndMinutes = parseTime(missedSession.endTime)
    // Fetch all sessions scheduled for this user (weekly template)
    const { data: existingSessions } = await supabase
      .from("sessions")
      .select("day_of_week, start_time, end_time")
      .eq("user_id", userId)

    const existingByDay = new Map<string, { start: number; end: number }[]>()
    for (const s of (existingSessions || []) as Array<{
      day_of_week: string
      start_time: string
      end_time: string
    }>) {
      const day = s.day_of_week.toLowerCase()
      if (!existingByDay.has(day)) existingByDay.set(day, [])
      existingByDay.get(day)!.push({
        start: parseTime(s.start_time),
        end: parseTime(s.end_time),
      })
    }

    // Compute all free slots from the timetable
    const allFreeSlots = buildFreeSlots(timetable, bedtime, blockedSlots)

    const passes = [
      { maxDayIndex: sessionDayIndex + 2, minDuration: 25 },
      { maxDayIndex: 6, minDuration: 20 },
    ]

    for (const pass of passes) {
      const candidates = allFreeSlots.filter((slot) => {
        const slotDayIndex = DAY_ORDER[slot.day] ?? 0
        const slotStartMinutes = parseTime(slot.start)

        if (slotDayIndex < sessionDayIndex || slotDayIndex > pass.maxDayIndex) return false

        if (slotDayIndex === sessionDayIndex && slotStartMinutes <= sessionEndMinutes) return false

        if (slot.durationMinutes < pass.minDuration) return false

        const dayExisting = existingByDay.get(slot.day) || []
        const slotEndMinutes = parseTime(slot.end)
        for (const existing of dayExisting) {
          if (slotStartMinutes < existing.end && slotEndMinutes > existing.start) {
            return false
          }
        }

        return true
      })
      if (candidates.length > 0) return candidates[0]
    }
    return null
  }

  static async createRescheduledRow(
    supabase: SupabaseClient,
    params: {
      userId: string
      originalHistoriqueId: string
      subject: string
      sessionType: "td" | "review" | "break"
      pedagogicalNote: string
      targetSlot: FreeSlot
    }
  ): Promise<void> {
    const { userId, originalHistoriqueId, subject, sessionType, pedagogicalNote, targetSlot } = params

    const { error } = await supabase.from("historique").insert({
      user_id: userId,
      subject,
      session_type: sessionType as "td" | "review" | "break",
      pedagogical_note: pedagogicalNote,
      completed: null,
      rescheduled_from: originalHistoriqueId,
      completed_at: new Date().toISOString(),
    })

    if (error) {
      logger.error({ error }, "Failed to create rescheduled historique row")
      throw new Error(`Erreur lors de la reprogrammation: ${error.message}`)
    }
  }
}
