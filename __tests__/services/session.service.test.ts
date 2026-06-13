import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"
import { SessionService, DbSession, Seance } from "@/src/services/session.service"
import { GeneratedSeance } from "@/src/lib/langgraph/state"

describe("SessionService", () => {
  let mock: ReturnType<typeof createMockSupabase>
  let service: SessionService

  const baseSession: DbSession = {
    id: "sess-1",
    user_id: "user-1",
    day_of_week: "monday",
    start_time: "08:00",
    end_time: "09:00",
    subject: "Maths",
    session_type: "td",
    pedagogical_note: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  }

  beforeEach(() => {
    mock = createMockSupabase()
    service = new SessionService(mock.supabase)
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should extend BaseService with sessions table", () => {
      expect(service["tableName"]).toBe("sessions")
    })
  })

  describe("getWeeklyTemplate", () => {
    const sessions: DbSession[] = [
      { ...baseSession, day_of_week: "monday", start_time: "08:00" },
      { ...baseSession, id: "sess-2", day_of_week: "monday", start_time: "10:00" },
      { ...baseSession, id: "sess-3", day_of_week: "tuesday", start_time: "08:00" },
    ]

    it("should fetch sessions filtered by user_id and ordered by day_of_week then start_time", async () => {
      mock.setResult(sessions)
      const result = await service.getWeeklyTemplate("user-1")

      expect(result).toEqual(sessions)
      expect(mock.supabase.from).toHaveBeenCalledWith("sessions")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mock.builder.order).toHaveBeenNthCalledWith(1, "day_of_week", { ascending: true })
      expect(mock.builder.order).toHaveBeenNthCalledWith(2, "start_time", { ascending: true })
    })

    it("should return empty array when no sessions", async () => {
      mock.setResult([])
      const result = await service.getWeeklyTemplate("user-1")

      expect(result).toEqual([])
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("select error"))
      })
      await expect(service.getWeeklyTemplate("user-1")).rejects.toThrow("select error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("week error") })
      })
      await expect(service.getWeeklyTemplate("user-1")).rejects.toThrow(
        "Erreur lors de la récupération du planning: week error"
      )
    })
  })

  describe("getSessionsForDay", () => {
    const mondaySessions: DbSession[] = [
      { ...baseSession, start_time: "08:00" },
      { ...baseSession, id: "sess-2", start_time: "10:00" },
    ]

    it("should fetch sessions filtered by user_id and day_of_week, ordered by start_time", async () => {
      mock.setResult(mondaySessions)
      const result = await service.getSessionsForDay("user-1", "monday")

      expect(result).toEqual(mondaySessions)
      expect(mock.supabase.from).toHaveBeenCalledWith("sessions")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mock.builder.eq).toHaveBeenCalledWith("day_of_week", "monday")
      expect(mock.builder.order).toHaveBeenCalledWith("start_time", { ascending: true })
    })

    it("should work with different days of the week", async () => {
      mock.setResult([])
      await service.getSessionsForDay("user-1", "friday")

      expect(mock.builder.eq).toHaveBeenCalledWith("day_of_week", "friday")
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("day query error"))
      })
      await expect(service.getSessionsForDay("user-1", "monday")).rejects.toThrow("day query error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("day error") })
      })
      await expect(service.getSessionsForDay("user-1", "friday")).rejects.toThrow(
        "Erreur lors de la récupération des séances du friday: day error"
      )
    })
  })

  describe("createMany", () => {
    const newSessions: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "08:00",
        end_time: "09:00",
        subject: "Maths",
        session_type: "td",
        pedagogical_note: "Focus on algebra",
      },
      {
        day_of_week: "tuesday",
        start_time: "10:00",
        end_time: "11:00",
        subject: "Physics",
        session_type: "td",
        pedagogical_note: "Exercises",
      },
    ]

    const createdSeances: Seance[] = newSessions.map((s, i) => ({
      ...s,
      id: `new-${i}`,
      user_id: "user-1",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    }))

    it("should insert multiple sessions with user_id attached", async () => {
      mock.setResult(createdSeances)
      const result = await service.createMany("user-1", newSessions)

      expect(result).toEqual(createdSeances)
      expect(mock.builder.insert).toHaveBeenCalledWith(newSessions.map((s) => ({ ...s, user_id: "user-1" })))
      expect(mock.builder.select).toHaveBeenCalled()
    })

    it("should return empty array when sessions array is empty", async () => {
      const result = await service.createMany("user-1", [])

      expect(result).toEqual([])
      expect(mock.supabase.from).not.toHaveBeenCalled()
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("insert error"))
      })
      await expect(service.createMany("user-1", newSessions)).rejects.toThrow("insert error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("batch insert error") })
      })
      await expect(service.createMany("user-1", newSessions)).rejects.toThrow(
        "Erreur lors de la création des séances: batch insert error"
      )
    })
  })

  describe("replaceAll", () => {
    const newSessions: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "08:00",
        end_time: "09:00",
        subject: "Maths",
        session_type: "td",
        pedagogical_note: "Algebra review",
      },
    ]

    const returnedSeances: Seance[] = [
      {
        ...newSessions[0],
        id: "replaced-1",
        user_id: "user-1",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ]

    it("should call the replace_user_sessions RPC with p_user_id and p_sessions", async () => {
      mock.setResult(returnedSeances)
      const result = await service.replaceAll("user-1", newSessions)

      expect(result).toEqual(returnedSeances)
      expect(mock.supabase.rpc).toHaveBeenCalledWith("replace_user_sessions", {
        p_user_id: "user-1",
        p_sessions: newSessions,
      })
    })

    it("should return empty array when data is null from RPC", async () => {
      mock.setResult(null)
      const result = await service.replaceAll("user-1", newSessions)

      expect(result).toEqual([])
    })

    it("should throw on RPC error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("RPC failed"))
      })
      await expect(service.replaceAll("user-1", newSessions)).rejects.toThrow("RPC failed")
    })

    it("should throw with wrapped message when RPC returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("RPC error") })
      })
      await expect(service.replaceAll("user-1", newSessions)).rejects.toThrow(
        "Erreur lors du remplacement du planning: RPC error"
      )
    })
  })
})
