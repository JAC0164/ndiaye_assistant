import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"
import { HistoriqueService, Historique } from "@/src/services/historique.service"

describe("HistoriqueService", () => {
  let mock: ReturnType<typeof createMockSupabase>
  let service: HistoriqueService

  const baseHistorique: Historique = {
    id: "hist-1",
    user_id: "user-1",
    session_id: null,
    subject: "Maths",
    session_type: "td",
    completed_at: "2024-02-01T10:00:00Z",
    duration_minutes: 60,
    self_rating: 4,
    notes: null,
  }

  beforeEach(() => {
    mock = createMockSupabase()
    service = new HistoriqueService(mock.supabase)
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should extend BaseService with historique table", () => {
      expect(service["tableName"]).toBe("historique")
    })
  })

  describe("logCompletion", () => {
    const logPayload = {
      user_id: "user-1",
      session_id: "sess-1",
      subject: "Maths",
      session_type: "td" as const,
      duration_minutes: 45,
      self_rating: 4,
      notes: "Good session",
    }

    const createdRecord: Historique = {
      ...baseHistorique,
      session_id: "sess-1",
      duration_minutes: 45,
      self_rating: 4,
      notes: "Good session",
    }

    it("should insert a completion record with completed_at and return it", async () => {
      mock.setResult(createdRecord)
      const result = await service.logCompletion(logPayload)

      expect(result).toEqual(createdRecord)
      expect(mock.supabase.from).toHaveBeenCalledWith("historique")
      expect(mock.builder.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        session_id: "sess-1",
        subject: "Maths",
        session_type: "td",
        duration_minutes: 45,
        self_rating: 4,
        notes: "Good session",
        completed_at: expect.any(String),
      })
      expect(mock.builder.select).toHaveBeenCalled()
      expect(mock.builder.single).toHaveBeenCalled()
    })

    it("should set session_id to null when not provided", async () => {
      mock.setResult({ ...baseHistorique })
      await service.logCompletion({
        user_id: "user-1",
        subject: "Physics",
        session_type: "td",
      })

      const insertCall = vi.mocked(mock.builder.insert).mock.calls[0][0]
      expect(insertCall.session_id).toBeNull()
    })

    it("should set duration_minutes to null when not provided", async () => {
      mock.setResult({ ...baseHistorique })
      await service.logCompletion({
        user_id: "user-1",
        subject: "Physics",
        session_type: "td",
      })

      const insertCall = vi.mocked(mock.builder.insert).mock.calls[0][0]
      expect(insertCall.duration_minutes).toBeNull()
    })

    it("should set self_rating to null when not provided", async () => {
      mock.setResult({ ...baseHistorique })
      await service.logCompletion({
        user_id: "user-1",
        subject: "Physics",
        session_type: "td",
      })

      const insertCall = vi.mocked(mock.builder.insert).mock.calls[0][0]
      expect(insertCall.self_rating).toBeNull()
    })

    it("should set notes to null when not provided", async () => {
      mock.setResult({ ...baseHistorique })
      await service.logCompletion({
        user_id: "user-1",
        subject: "Physics",
        session_type: "td",
      })

      const insertCall = vi.mocked(mock.builder.insert).mock.calls[0][0]
      expect(insertCall.notes).toBeNull()
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("insert error"))
      })
      await expect(service.logCompletion(logPayload)).rejects.toThrow("insert error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("log error") })
      })
      await expect(service.logCompletion(logPayload)).rejects.toThrow(
        "Erreur lors de l'enregistrement de l'historique: log error"
      )
    })
  })

  describe("getWeeklyStats", () => {
    const logs: Historique[] = [
      {
        ...baseHistorique,
        id: "1",
        subject: "Maths",
        duration_minutes: 60,
        self_rating: 4,
        completed_at: "2024-02-07T10:00:00Z",
      },
      {
        ...baseHistorique,
        id: "2",
        subject: "Physics",
        duration_minutes: 45,
        self_rating: 5,
        completed_at: "2024-02-06T10:00:00Z",
      },
      {
        ...baseHistorique,
        id: "3",
        subject: "Maths",
        duration_minutes: 30,
        self_rating: null,
        completed_at: "2024-02-05T10:00:00Z",
      },
    ]

    it("should fetch logs from last 7 days and compute aggregated stats", async () => {
      mock.setResult(logs)
      const result = await service.getWeeklyStats("user-1")

      expect(result.totalMinutes).toBe(135)
      expect(result.sessionCount).toBe(3)
      expect(result.averageRating).toBe(4.5)
      expect(result.completedBySubject).toEqual({ Maths: 2, Physics: 1 })
      expect(result.recentLogs).toEqual(logs)
    })

    it("should call supabase with correct filters", async () => {
      mock.setResult(logs)
      await service.getWeeklyStats("user-1")

      expect(mock.supabase.from).toHaveBeenCalledWith("historique")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mock.builder.gte).toHaveBeenCalledWith("completed_at", expect.any(String))
      expect(mock.builder.order).toHaveBeenCalledWith("completed_at", { ascending: false })
    })

    it("should return null averageRating when no ratings exist", async () => {
      const noRatingLogs = logs.map((l) => ({ ...l, self_rating: null }))
      mock.setResult(noRatingLogs)
      const result = await service.getWeeklyStats("user-1")

      expect(result.averageRating).toBeNull()
      expect(result.totalMinutes).toBe(135)
      expect(result.sessionCount).toBe(3)
    })

    it("should handle empty logs gracefully", async () => {
      mock.setResult([])
      const result = await service.getWeeklyStats("user-1")

      expect(result.totalMinutes).toBe(0)
      expect(result.sessionCount).toBe(0)
      expect(result.averageRating).toBeNull()
      expect(result.completedBySubject).toEqual({})
      expect(result.recentLogs).toEqual([])
    })

    it("should handle logs with missing duration_minutes", async () => {
      const logsWithNullDuration = logs.map((l) => ({ ...l, duration_minutes: null }))
      mock.setResult(logsWithNullDuration)
      const result = await service.getWeeklyStats("user-1")

      expect(result.totalMinutes).toBe(0)
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("stats error"))
      })
      await expect(service.getWeeklyStats("user-1")).rejects.toThrow("stats error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("weekly error") })
      })
      await expect(service.getWeeklyStats("user-1")).rejects.toThrow(
        "Erreur lors du calcul des statistiques hebdomadaires: weekly error"
      )
    })
  })

  describe("getDaysSinceLastRevisionBySubject", () => {
    it("should fetch completed_at per subject and return correct map of days diff", async () => {
      const now = new Date()

      const lastMathsDate = new Date()
      lastMathsDate.setDate(now.getDate() - 3) // 3 days ago

      const lastPhysicsDate = new Date()
      lastPhysicsDate.setDate(now.getDate() - 5) // 5 days ago

      const mockData = [
        { subject: "Maths", completed_at: lastMathsDate.toISOString() },
        { subject: "Physics", completed_at: lastPhysicsDate.toISOString() },
        // older record for Maths
        { subject: "Maths", completed_at: new Date(lastMathsDate.getTime() - 1000 * 60 * 60 * 24).toISOString() },
      ]

      mock.setResult(mockData)
      const result = await service.getDaysSinceLastRevisionBySubject("user-1")

      expect(result.get("Maths")).toBe(3)
      expect(result.get("Physics")).toBe(5)

      expect(mock.supabase.from).toHaveBeenCalledWith("historique")
      expect(mock.builder.select).toHaveBeenCalledWith("subject, completed_at")
      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("db error") })
      })
      await expect(service.getDaysSinceLastRevisionBySubject("user-1")).rejects.toThrow(
        "Erreur lors de la récupération de l'historique par matière: db error"
      )
    })

    it("should handle null data gracefully (line 107 || [] fallback)", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: null })
      })
      const result = await service.getDaysSinceLastRevisionBySubject("user-1")
      expect(result.size).toBe(0)
    })

    it("should skip rows with null subject (line 108 continue)", async () => {
      const now = new Date()
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString()
      mock.setResult([
        { subject: null, completed_at: threeDaysAgo },
        { subject: "Maths", completed_at: threeDaysAgo },
      ])
      const result = await service.getDaysSinceLastRevisionBySubject("user-1")
      expect(result.get("Maths")).toBe(3)
      expect(result.size).toBe(1)
    })

    it("should skip rows with null completed_at (line 108 continue)", async () => {
      mock.setResult([
        { subject: "Maths", completed_at: null },
        { subject: "Physics", completed_at: null },
      ])
      const result = await service.getDaysSinceLastRevisionBySubject("user-1")
      expect(result.size).toBe(0)
    })
  })
})
