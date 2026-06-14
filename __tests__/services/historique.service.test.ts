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

  describe("saveFeedback", () => {
    it("should update completed field on the matched historique row", async () => {
      mock.setResult(null)
      await service.saveFeedback("hist-1", "user-1", { completed: true })

      expect(mock.supabase.from).toHaveBeenCalledWith("historique")
      expect(mock.builder.update).toHaveBeenCalledWith({ completed: true })
      expect(mock.builder.eq).toHaveBeenCalledWith("id", "hist-1")
      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
    })

    it("should include ressenti when provided", async () => {
      mock.setResult(null)
      await service.saveFeedback("hist-1", "user-1", { completed: true, ressenti: 2 })

      expect(mock.builder.update).toHaveBeenCalledWith({ completed: true, ressenti: 2 })
    })

    it("should include duree_reelle_min when provided", async () => {
      mock.setResult(null)
      await service.saveFeedback("hist-1", "user-1", { completed: false, duree_reelle_min: 30 })

      expect(mock.builder.update).toHaveBeenCalledWith({ completed: false, duree_reelle_min: 30 })
    })

    it("should not include ressenti or duree_reelle_min when not provided", async () => {
      mock.setResult(null)
      await service.saveFeedback("hist-1", "user-1", { completed: false })

      expect(mock.builder.update).toHaveBeenCalledWith({ completed: false })
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("update error"))
      })
      await expect(service.saveFeedback("hist-1", "user-1", { completed: true })).rejects.toThrow("update error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("feedback error") })
      })
      await expect(service.saveFeedback("hist-1", "user-1", { completed: true })).rejects.toThrow(
        "Erreur lors de l'enregistrement du feedback: feedback error"
      )
    })
  })

  describe("getRessentBySubject", () => {
    const now = new Date()
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

    it("returns weighted average ressenti per subject over last 28 days", async () => {
      mock.setResult([
        { subject: "Maths", ressenti: 1, completed_at: daysAgo(2) }, // weight 4, within 7 days
        { subject: "Maths", ressenti: 3, completed_at: daysAgo(10) }, // weight 3, within 14 days
        { subject: "Maths", ressenti: 2, completed_at: daysAgo(20) }, // weight 2, within 21 days
        { subject: "FR", ressenti: 3, completed_at: daysAgo(1) }, // weight 4
      ])
      const result = await service.getRessentBySubject("user-1")

      // Maths: (1*4 + 3*3 + 2*2) / (4+3+2) = (4 + 9 + 4) / 9 = 17/9 = 1.89
      expect(result.get("Maths")).toBe(1.89)
      // FR: (3*4) / 4 = 3.0
      expect(result.get("FR")).toBe(3.0)
    })

    it("applies weight 1 for sessions 22-28 days ago", async () => {
      mock.setResult([
        { subject: "Maths", ressenti: 2, completed_at: daysAgo(25) }, // weight 1
        { subject: "Maths", ressenti: 3, completed_at: daysAgo(27) }, // weight 1
      ])
      const result = await service.getRessentBySubject("user-1")

      // Maths: (2*1 + 3*1) / (1+1) = 5/2 = 2.5
      expect(result.get("Maths")).toBe(2.5)
    })

    it("skips rows with null subject or null ressenti", async () => {
      mock.setResult([
        { subject: null, ressenti: 2, completed_at: daysAgo(1) },
        { subject: "Maths", ressenti: null, completed_at: daysAgo(1) },
        { subject: "Maths", ressenti: 3, completed_at: daysAgo(2) },
      ])
      const result = await service.getRessentBySubject("user-1")

      expect(result.size).toBe(1)
      expect(result.get("Maths")).toBe(3)
    })

    it("handles null data gracefully (empty for-of fallback)", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: null })
      })
      const result = await service.getRessentBySubject("user-1")
      expect(result.size).toBe(0)
    })

    it("returns empty map when no feedback exists", async () => {
      mock.setResult([])
      const result = await service.getRessentBySubject("user-1")
      expect(result.size).toBe(0)
    })

    it("should call supabase with correct filters", async () => {
      mock.setResult([])
      await service.getRessentBySubject("user-1")

      expect(mock.supabase.from).toHaveBeenCalledWith("historique")
      expect(mock.builder.select).toHaveBeenCalledWith("subject, ressenti, completed_at")
      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mock.builder.eq).toHaveBeenCalledWith("completed", true)
      expect(mock.builder.not).toHaveBeenCalledWith("ressenti", "is", null)
      expect(mock.builder.gte).toHaveBeenCalledWith("completed_at", expect.any(String))
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("ressenti error") })
      })
      await expect(service.getRessentBySubject("user-1")).rejects.toThrow(
        "Erreur lors de la récupération des ressentis: ressenti error"
      )
    })
  })

  describe("getDureeReelleBySubject", () => {
    const now = new Date()
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

    it("returns average real duration per subject over last 28 days", async () => {
      mock.setResult([
        { subject: "Maths", duree_reelle_min: 40, completed_at: daysAgo(2) },
        { subject: "Maths", duree_reelle_min: 50, completed_at: daysAgo(5) },
        { subject: "FR", duree_reelle_min: 30, completed_at: daysAgo(1) },
      ])
      const result = await service.getDureeReelleBySubject("user-1")

      // Maths: (40+50)/2 = 45
      expect(result.get("Maths")).toBe(45)
      // FR: 30
      expect(result.get("FR")).toBe(30)
    })

    it("skips rows with null subject or null duree_reelle_min", async () => {
      mock.setResult([
        { subject: null, duree_reelle_min: 30, completed_at: daysAgo(1) },
        { subject: "Maths", duree_reelle_min: null, completed_at: daysAgo(1) },
        { subject: "Maths", duree_reelle_min: 45, completed_at: daysAgo(2) },
      ])
      const result = await service.getDureeReelleBySubject("user-1")

      expect(result.size).toBe(1)
      expect(result.get("Maths")).toBe(45)
    })

    it("handles null data gracefully (empty for-of fallback)", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: null })
      })
      const result = await service.getDureeReelleBySubject("user-1")
      expect(result.size).toBe(0)
    })

    it("returns empty map when no durations exist", async () => {
      mock.setResult([])
      const result = await service.getDureeReelleBySubject("user-1")
      expect(result.size).toBe(0)
    })

    it("should call supabase with correct filters", async () => {
      mock.setResult([])
      await service.getDureeReelleBySubject("user-1")

      expect(mock.supabase.from).toHaveBeenCalledWith("historique")
      expect(mock.builder.select).toHaveBeenCalledWith("subject, duree_reelle_min")
      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mock.builder.eq).toHaveBeenCalledWith("completed", true)
      expect(mock.builder.not).toHaveBeenCalledWith("duree_reelle_min", "is", null)
      expect(mock.builder.gte).toHaveBeenCalledWith("completed_at", expect.any(String))
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("duree error") })
      })
      await expect(service.getDureeReelleBySubject("user-1")).rejects.toThrow(
        "Erreur lors de la récupération des durées réelles: duree error"
      )
    })
  })
})
