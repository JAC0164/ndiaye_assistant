import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"
import { RescheduleService, RescheduleSessionInfo } from "@/src/services/reschedule.service"
import { ExtractedTimetable, BlockedSlot, FreeSlot } from "@/src/types/planning.types"

vi.mock("@/src/lib/planning/buildFreeSlots", () => ({
  buildFreeSlots: vi.fn(),
  parseTime: vi.fn((s: string) => {
    const [h, m] = s.split(":").map(Number)
    return h * 60 + m
  }),
  formatTime: vi.fn((m: number) => {
    const h = Math.floor(m / 60)
    const mins = m % 60
    return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
  }),
}))

import { buildFreeSlots } from "@/src/lib/planning/buildFreeSlots"

const mockTimetable: ExtractedTimetable = {
  filiere: "Terminale S1",
  days: [
    {
      day: "monday",
      slots: [
        { start: "08:00", end: "10:00", subject: "MATH", coefficient: 4, subject_type: "scientific" },
        { start: "10:00", end: "12:00", subject: "FR", coefficient: 5, subject_type: "literary" },
      ],
    },
    {
      day: "tuesday",
      slots: [{ start: "08:00", end: "10:00", subject: "ANG", coefficient: 3, subject_type: "language" }],
    },
  ],
}

const mockBlockedSlots: BlockedSlot[] = []

describe("RescheduleService", () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
    vi.clearAllMocks()
  })

  describe("findNextSlot", () => {
    const missedSession: RescheduleSessionInfo = {
      id: "hist-1",
      sessionId: "sess-1",
      subject: "MATH",
      sessionType: "td",
      pedagogicalNote: "Fais les exercices",
      dayOfWeek: "monday",
      endTime: "12:00",
    }

    it("returns null when no free slot is available within 48h", async () => {
      vi.mocked(buildFreeSlots).mockReturnValue([])

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession,
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      expect(result).toBeNull()
    })

    it("does not return slots that overlap existing sessions", async () => {
      const freeSlots: FreeSlot[] = [
        { day: "monday", start: "14:00", end: "15:00", durationMinutes: 60 },
        { day: "tuesday", start: "14:00", end: "15:00", durationMinutes: 60 },
      ]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)

      // Existing session overlapping the monday slot
      const existingSessions = [{ day_of_week: "monday", start_time: "13:30", end_time: "15:00" }]
      mock.setResult(existingSessions)

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession,
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      // Monday slot is blocked by existing session, tuesday should be available
      expect(result).not.toBeNull()
      expect(result!.day).toBe("tuesday")
    })

    it("handles null existing sessions data gracefully (|| [] fallback)", async () => {
      const freeSlots: FreeSlot[] = [{ day: "tuesday", start: "14:00", end: "15:00", durationMinutes: 60 }]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)
      // Return null from supabase (simulating null data)
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: null })
      })

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession,
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      expect(result).not.toBeNull()
      expect(result!.day).toBe("tuesday")
    })

    it("uses fallback day index 0 when dayOfWeek is unknown", async () => {
      const freeSlots: FreeSlot[] = [{ day: "sunday", start: "14:00", end: "15:00", durationMinutes: 60 }]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)
      mock.setResult([])

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession: {
          ...missedSession,
          dayOfWeek: "funday", // not in dayOrder map → falls back to 0
          endTime: "10:00",
        },
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      // funday → index 0, so sessionDayIndex = 0
      // maxDayIndex = 0 + 2 = 2
      // sunday → index 6, 6 > 2 → filtered out
      expect(result).toBeNull()
    })

    it("filters out slots earlier in the week than the missed session day", async () => {
      const freeSlots: FreeSlot[] = [{ day: "monday", start: "08:00", end: "09:00", durationMinutes: 60 }]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)
      mock.setResult([])

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession: { ...missedSession, dayOfWeek: "tuesday", endTime: "10:00" },
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      // monday (0) < tuesday (1) → filtered out by slotDayIndex < sessionDayIndex
      expect(result).toBeNull()
    })

    it("filters out slots beyond the 48h window", async () => {
      const freeSlots: FreeSlot[] = [{ day: "friday", start: "08:00", end: "09:00", durationMinutes: 60 }]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)
      mock.setResult([])

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession: { ...missedSession, dayOfWeek: "tuesday", endTime: "10:00" },
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      // tuesday = 1, max = 3, friday = 4 > 3 → filtered out
      expect(result).toBeNull()
    })

    it("filters out slots that are too short", async () => {
      const freeSlots: FreeSlot[] = [{ day: "monday", start: "14:00", end: "14:15", durationMinutes: 15 }]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)
      mock.setResult([])

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession: { ...missedSession, endTime: "10:00" },
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      // durationMinutes 15 < 25 → filtered out
      expect(result).toBeNull()
    })

    it("passes a candidate slot when it starts after existing session ends (no overlap)", async () => {
      const freeSlots: FreeSlot[] = [{ day: "monday", start: "15:00", end: "16:00", durationMinutes: 60 }]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)

      // Existing session ends at 14:00, candidate starts at 15:00 → no overlap
      const existingSessions = [{ day_of_week: "monday", start_time: "13:00", end_time: "14:00" }]
      mock.setResult(existingSessions)

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession: { ...missedSession, endTime: "10:00" },
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      expect(result).not.toBeNull()
      expect(result!.start).toBe("15:00")
    })

    it("returns the earliest available slot after the missed session's end time", async () => {
      const freeSlots: FreeSlot[] = [
        { day: "monday", start: "14:00", end: "15:00", durationMinutes: 60 },
        { day: "monday", start: "16:00", end: "17:00", durationMinutes: 60 },
      ]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)
      mock.setResult([]) // no existing sessions

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession: { ...missedSession, endTime: "14:30" },
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      // First slot (14:00-15:00) starts before 14:30 → skipped
      expect(result).not.toBeNull()
      expect(result!.start).toBe("16:00")
    })

    it("handles free slot with unknown day name (dayOrder fallback to 0)", async () => {
      const freeSlots: FreeSlot[] = [{ day: "funday", start: "14:00", end: "15:00", durationMinutes: 60 }]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)
      mock.setResult([])

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession: { ...missedSession, endTime: "10:00" },
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      // funday → dayOrder gives undefined → ?? 0 → slotDayIndex = 0
      // sessionDayIndex = 0 (monday), max = 2, 0 is within range
      // Should pass the filter
      expect(result).not.toBeNull()
    })

    it("handles multiple existing sessions on the same day (map set then push)", async () => {
      const freeSlots: FreeSlot[] = [{ day: "monday", start: "20:00", end: "21:00", durationMinutes: 60 }]
      vi.mocked(buildFreeSlots).mockReturnValue(freeSlots)

      // Two sessions on the same day → second triggers has(day) true branch
      const existingSessions = [
        { day_of_week: "monday", start_time: "08:00", end_time: "10:00" },
        { day_of_week: "monday", start_time: "14:00", end_time: "16:00" },
      ]
      mock.setResult(existingSessions)

      const result = await RescheduleService.findNextSlot(mock.supabase, {
        userId: "user-1",
        missedSession: { ...missedSession, endTime: "10:00" },
        timetable: mockTimetable,
        bedtime: "22:00",
        blockedSlots: mockBlockedSlots,
      })

      // 20:00 is after both existing sessions → no overlap → should pass
      expect(result).not.toBeNull()
      expect(result!.start).toBe("20:00")
    })
  })

  describe("createRescheduledRow", () => {
    it("inserts a new historique row with rescheduled_from set", async () => {
      const targetSlot: FreeSlot = {
        day: "tuesday",
        start: "16:00",
        end: "16:45",
        durationMinutes: 45,
      }

      mock.setResult(null)
      await RescheduleService.createRescheduledRow(mock.supabase, {
        userId: "user-1",
        originalHistoriqueId: "hist-1",
        subject: "MATH",
        sessionType: "td",
        pedagogicalNote: "Fais les exercices",
        targetSlot,
      })

      expect(mock.supabase.from).toHaveBeenCalledWith("historique")
      const insertCall = vi.mocked(mock.builder.insert).mock.calls[0][0]
      expect(insertCall).toMatchObject({
        user_id: "user-1",
        subject: "MATH",
        rescheduled_from: "hist-1",
        completed: null,
      })
    })

    it("throws when database returns an error", async () => {
      const targetSlot: FreeSlot = {
        day: "tuesday",
        start: "16:00",
        end: "16:45",
        durationMinutes: 45,
      }

      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("insert error") })
      })

      await expect(
        RescheduleService.createRescheduledRow(mock.supabase, {
          userId: "user-1",
          originalHistoriqueId: "hist-1",
          subject: "MATH",
          sessionType: "td",
          pedagogicalNote: "Fais les exercices",
          targetSlot,
        })
      ).rejects.toThrow("Erreur lors de la reprogrammation: insert error")
    })
  })
})
