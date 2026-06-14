import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockRequest } from "@/src/test/utils/mock-request"

const shared = vi.hoisted(() => {
  // Builders with independent then handlers keyed by table name
  const builders = new Map<string, ReturnType<typeof Object>>()

  function createBuilder() {
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.insert = vi.fn(() => builder)
    builder.update = vi.fn(() => builder)
    builder.delete = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.single = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.gte = vi.fn(() => builder)
    builder.lte = vi.fn(() => builder)
    builder.not = vi.fn(() => builder)
    // then must be a proper function, not a vi.fn, so await works
    let resolvePromise: ((value: unknown) => void) | null = null
    builder.promise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    builder.resolveWith = (data: unknown) => {
      resolvePromise!(data)
    }
    builder.then = function (onfulfilled: (value: unknown) => unknown) {
      return builder.promise.then(onfulfilled)
    }
    return builder
  }

  function getBuilderForTable(table: string) {
    if (!builders.has(table)) {
      builders.set(table, createBuilder())
    }
    return builders.get(table)!
  }

  const supabase = {
    from: vi.fn((table: string) => getBuilderForTable(table)),
    rpc: vi.fn(),
    schema: vi.fn(),
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }
  return { supabase, builders, getBuilderForTable }
})

vi.mock("@/src/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(shared.supabase),
}))

vi.mock("@/src/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => true),
}))

const mockSaveFeedback = vi.fn()
vi.mock("@/src/services/historique.service", () => ({
  HistoriqueService: vi.fn(function () {
    return { saveFeedback: mockSaveFeedback }
  }),
}))

const mockGetByUserId = vi.fn()
vi.mock("@/src/services/profile.service", () => ({
  ProfileService: vi.fn(function () {
    return { getByUserId: mockGetByUserId }
  }),
}))

vi.mock("@/src/services/reschedule.service", () => ({
  RescheduleService: {
    findNextSlot: vi.fn(),
    createRescheduledRow: vi.fn(),
  },
}))

import { PATCH } from "@/app/api/sessions/[id]/feedback/route"
import { checkRateLimit } from "@/src/lib/rate-limit"

describe("PATCH /api/sessions/[id]/feedback", () => {
  const userId = "user-123"
  const sessionId = "hist-1"
  const params = Promise.resolve({ id: sessionId })

  function resetBuilders() {
    shared.builders.clear()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockReturnValue(true)
    resetBuilders()
  })

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue(false)

    const request = createMockRequest("PATCH", { body: { completed: true } })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(429)
  })

  it("returns 401 when user is not authenticated", async () => {
    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("Not authenticated"),
    })

    const request = createMockRequest("PATCH", { body: { completed: true } })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(401)
  })

  it("returns 400 when body is missing completed field", async () => {
    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })

    const request = createMockRequest("PATCH", { body: { ressenti: 2 } })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data).toHaveProperty("error")
  })

  it("returns 400 when body is invalid JSON", async () => {
    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })

    const request = createMockRequest("PATCH")
    request.json = vi.fn().mockRejectedValue(new Error("Invalid JSON"))
    const response = await PATCH(request, { params })

    expect(response.status).toBe(400)
  })

  it("returns 400 when ressenti is out of range", async () => {
    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })

    const request = createMockRequest("PATCH", { body: { completed: true, ressenti: 5 } })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(400)
  })

  it("saves feedback and returns ok when completed is true", async () => {
    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })

    mockSaveFeedback.mockResolvedValue(undefined)

    const request = createMockRequest("PATCH", { body: { completed: true, ressenti: 2, duree_reelle_min: 30 } })
    const response = await PATCH(request, { params })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ ok: true })
    expect(mockSaveFeedback).toHaveBeenCalledWith(sessionId, userId, {
      completed: true,
      ressenti: 2,
      duree_reelle_min: 30,
    })
  })

  it("does NOT call reschedule when completed is true", async () => {
    const { RescheduleService } = await import("@/src/services/reschedule.service")

    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })
    mockSaveFeedback.mockResolvedValue(undefined)

    const request = createMockRequest("PATCH", { body: { completed: true } })
    await PATCH(request, { params })

    expect(RescheduleService.findNextSlot).not.toHaveBeenCalled()
  })

  describe("reschedule path (completed = false)", () => {
    it("attempts reschedule with non-empty blockedSlots triggering the map callback", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: {
          cachedExtractedTimetable: JSON.stringify({
            filiere: "Terminale S1",
            days: [{ day: "monday", slots: [] }],
          }),
          bedtime: "22:00",
          blockedSlots: [{ id: "b1", day: "tuesday", startTime: "18:00", endTime: "20:00", reason: "Cours du soir" }],
        },
      })

      vi.mocked(RescheduleService.findNextSlot).mockResolvedValue({
        day: "wednesday",
        start: "16:00",
        end: "16:45",
        durationMinutes: 45,
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).toHaveBeenCalled()
      expect(RescheduleService.createRescheduledRow).toHaveBeenCalled()
    })

    it("attempts reschedule when session has a session_id and timetable is cached", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      // Mock historiqe lookup result
      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "Do exercises",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      // Mock sessions lookup result
      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      // Mock profile with cached timetable
      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: {
          cachedExtractedTimetable: JSON.stringify({
            filiere: "Terminale S1",
            days: [{ day: "monday", slots: [] }],
          }),
          bedtime: "22:00",
          blockedSlots: [],
        },
      })

      vi.mocked(RescheduleService.findNextSlot).mockResolvedValue({
        day: "tuesday",
        start: "16:00",
        end: "16:45",
        durationMinutes: 45,
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).toHaveBeenCalled()
      expect(RescheduleService.createRescheduledRow).toHaveBeenCalled()
    })

    it("skips reschedule when historiqe row has no session_id", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: null,
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).not.toHaveBeenCalled()
    })

    it("skips reschedule when profile has no cached timetable", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      // Profile with no cached timetable
      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: { bedtime: "22:00", blockedSlots: [] },
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).not.toHaveBeenCalled()
    })

    it("handles JSON parse error in cached timetable gracefully", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: {
          cachedExtractedTimetable: "{broken json}",
          bedtime: "22:00",
          blockedSlots: [],
        },
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).not.toHaveBeenCalled()
    })

    it("skips reschedule when sessionRow is not found", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      // Sessions lookup returns null
      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: null,
        error: null,
      })

      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: { cachedExtractedTimetable: "{}", bedtime: "22:00", blockedSlots: [] },
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).not.toHaveBeenCalled()
    })

    it("skips reschedule when profile has no metadata", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      // Profile with null metadata
      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: null,
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).not.toHaveBeenCalled()
    })

    it("skips reschedule when profile is not found", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      mockGetByUserId.mockResolvedValue(null)

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).not.toHaveBeenCalled()
    })

    it("skips reschedule when findNextSlot returns null", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: {
          cachedExtractedTimetable: JSON.stringify({ filiere: "S1", days: [] }),
          bedtime: "22:00",
          blockedSlots: [],
        },
      })

      vi.mocked(RescheduleService.findNextSlot).mockResolvedValue(null)

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).toHaveBeenCalled()
      expect(RescheduleService.createRescheduledRow).not.toHaveBeenCalled()
    })

    it("uses default bedtime when metadata has no bedtime field", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: {
          cachedExtractedTimetable: JSON.stringify({ filiere: "S1", days: [] }),
        },
      })

      vi.mocked(RescheduleService.findNextSlot).mockResolvedValue({
        day: "tuesday",
        start: "16:00",
        end: "16:45",
        durationMinutes: 45,
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      expect(RescheduleService.findNextSlot).toHaveBeenCalled()
    })

    it("handles unknown day name in rescheduled slot (FRENCH_DAYS fallback)", async () => {
      const { RescheduleService } = await import("@/src/services/reschedule.service")

      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockResolvedValue(undefined)

      const historiqeBuilder = shared.getBuilderForTable("historique")
      historiqeBuilder.resolveWith({
        data: {
          id: "hist-1",
          session_id: "sess-1",
          subject: "MATH",
          session_type: "td",
          pedagogical_note: "",
          completed_at: "2026-06-13T10:00:00Z",
        },
        error: null,
      })

      const sessionsBuilder = shared.getBuilderForTable("sessions")
      sessionsBuilder.resolveWith({
        data: { day_of_week: "monday", start_time: "10:00", end_time: "12:00" },
        error: null,
      })

      mockGetByUserId.mockResolvedValue({
        id: userId,
        metadata: {
          cachedExtractedTimetable: JSON.stringify({
            filiere: "Terminale S1",
            days: [{ day: "monday", slots: [] }],
          }),
          bedtime: "22:00",
          blockedSlots: [],
        },
      })

      vi.mocked(RescheduleService.findNextSlot).mockResolvedValue({
        day: "funday",
        start: "16:00",
        end: "16:45",
        durationMinutes: 45,
      })

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.rescheduled).toBe(true)
      expect(data.message).toContain("funday")
    })

    it("handles errors in the overall try-catch gracefully", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })
      mockSaveFeedback.mockRejectedValue(new Error("Save failed"))

      const request = createMockRequest("PATCH", { body: { completed: false } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })
})
