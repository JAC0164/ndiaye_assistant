import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"
import { EcheanceService, Echeance } from "@/src/services/echeance.service"

describe("EcheanceService", () => {
  let mock: ReturnType<typeof createMockSupabase>
  let service: EcheanceService

  const baseEcheance: Echeance = {
    id: "ech-1",
    user_id: "user-1",
    subject: "Maths",
    title: "Devoir maison",
    description: null,
    due_date: "2024-02-15",
    echeance_type: "devoir",
    is_completed: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  }

  beforeEach(() => {
    mock = createMockSupabase()
    service = new EcheanceService(mock.supabase)
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should extend BaseService with echeances table", () => {
      expect(service["tableName"]).toBe("echeances")
    })
  })

  describe("getUpcoming", () => {
    const echeances: Echeance[] = [
      { ...baseEcheance, due_date: "2024-02-10" },
      { ...baseEcheance, id: "ech-2", due_date: "2024-02-15" },
    ]

    it("should fetch echeances filtered by user_id and due_date range, ordered ascending", async () => {
      mock.setResult(echeances)
      const result = await service.getUpcoming("user-1")

      expect(result).toEqual(echeances)
      expect(mock.supabase.from).toHaveBeenCalledWith("echeances")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mock.builder.gte).toHaveBeenCalledWith("due_date", expect.any(String))
      expect(mock.builder.lte).toHaveBeenCalledWith("due_date", expect.any(String))
      expect(mock.builder.order).toHaveBeenCalledWith("due_date", { ascending: true })
    })

    it("should use default daysLimit of 14", async () => {
      mock.setResult(echeances)
      await service.getUpcoming("user-1")

      const gteCall = vi.mocked(mock.builder.gte).mock.calls[0]
      const lteCall = vi.mocked(mock.builder.lte).mock.calls[0]

      const today = new Date()
      const futureDate = new Date()
      futureDate.setDate(today.getDate() + 14)

      const todayStr = today.toISOString().split("T")[0]
      const futureStr = futureDate.toISOString().split("T")[0]

      expect(gteCall[1]).toBe(todayStr)
      expect(lteCall[1]).toBe(futureStr)
    })

    it("should accept custom daysLimit", async () => {
      mock.setResult(echeances)
      await service.getUpcoming("user-1", 30)

      const lteCall = vi.mocked(mock.builder.lte).mock.calls[0]
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)
      const futureStr = futureDate.toISOString().split("T")[0]

      expect(lteCall[1]).toBe(futureStr)
    })

    it("should return empty array when no echeances", async () => {
      mock.setResult([])
      const result = await service.getUpcoming("user-1")

      expect(result).toEqual([])
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("query error"))
      })
      await expect(service.getUpcoming("user-1")).rejects.toThrow("query error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("upcoming error") })
      })
      await expect(service.getUpcoming("user-1")).rejects.toThrow(
        "Erreur lors de la récupération des échéances à venir: upcoming error"
      )
    })
  })

  describe("markCompleted", () => {
    const updatedEcheance: Echeance = {
      ...baseEcheance,
      is_completed: true,
      updated_at: "2024-02-01T12:00:00Z",
    }

    it("should set is_completed to true and update updated_at", async () => {
      mock.setResult(updatedEcheance)
      const result = await service.markCompleted("ech-1")

      expect(result).toEqual(updatedEcheance)
      expect(mock.supabase.from).toHaveBeenCalledWith("echeances")
      expect(mock.builder.update).toHaveBeenCalledWith({
        is_completed: true,
        updated_at: expect.any(String),
      })
      expect(mock.builder.eq).toHaveBeenCalledWith("id", "ech-1")
      expect(mock.builder.select).toHaveBeenCalled()
      expect(mock.builder.single).toHaveBeenCalled()
    })

    it("should set is_completed to false when isCompleted is false", async () => {
      const uncompletedEcheance = { ...baseEcheance, is_completed: false }
      mock.setResult(uncompletedEcheance)
      await service.markCompleted("ech-1", false)

      expect(mock.builder.update).toHaveBeenCalledWith({
        is_completed: false,
        updated_at: expect.any(String),
      })
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("update error"))
      })
      await expect(service.markCompleted("ech-1")).rejects.toThrow("update error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("mark error") })
      })
      await expect(service.markCompleted("ech-1")).rejects.toThrow(
        "Erreur lors du marquage de l'échéance comme complétée: mark error"
      )
    })
  })
})
