import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"
import { CoefficientService, Coefficient } from "@/src/services/coefficient.service"

describe("CoefficientService", () => {
  let mock: ReturnType<typeof createMockSupabase>
  let service: CoefficientService

  const baseCoefficient: Coefficient = {
    id: "coeff-1",
    class_id: "class-1",
    subject: "Maths",
    coefficient: 5,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  }

  beforeEach(() => {
    mock = createMockSupabase()
    service = new CoefficientService(mock.supabase)
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should extend BaseService with coefficients table", () => {
      expect(service["tableName"]).toBe("coefficients")
    })
  })

  describe("getByClassId", () => {
    const coefficients: Coefficient[] = [
      { ...baseCoefficient, subject: "Maths", coefficient: 5 },
      { ...baseCoefficient, id: "coeff-2", subject: "Physics", coefficient: 4 },
    ]

    it("should fetch coefficients filtered by class_id, ordered by coefficient descending", async () => {
      mock.setResult(coefficients)
      const result = await service.getByClassId("class-1")

      expect(result).toEqual(coefficients)
      expect(mock.supabase.from).toHaveBeenCalledWith("coefficients")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.eq).toHaveBeenCalledWith("class_id", "class-1")
      expect(mock.builder.order).toHaveBeenCalledWith("coefficient", { ascending: false })
    })

    it("should return empty array when no coefficients", async () => {
      mock.setResult([])
      const result = await service.getByClassId("class-1")

      expect(result).toEqual([])
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("select error"))
      })
      await expect(service.getByClassId("class-1")).rejects.toThrow("select error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("coeff fetch error") })
      })
      await expect(service.getByClassId("class-1")).rejects.toThrow(
        "Erreur lors de la récupération des coefficients pour la classe class-1: coeff fetch error"
      )
    })
  })

  describe("getCoefficientsByClassName", () => {
    const coefficients: Coefficient[] = [
      { ...baseCoefficient, subject: "Maths", coefficient: 5 },
    ]

    it("should fetch coefficients with inner join on classes by class name", async () => {
      mock.setResult(coefficients)
      const result = await service.getCoefficientsByClassName("Terminale S1")

      expect(result).toEqual(coefficients)
      expect(mock.supabase.from).toHaveBeenCalledWith("coefficients")
      expect(mock.builder.select).toHaveBeenCalledWith("*, classes!inner(name)")
      expect(mock.builder.eq).toHaveBeenCalledWith("classes.name", "Terminale S1")
      expect(mock.builder.order).toHaveBeenCalledWith("coefficient", { ascending: false })
    })

    it("should return empty array and log error instead of throwing on database error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("join error") })
      })
      const result = await service.getCoefficientsByClassName("Unknown")

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to fetch coefficients by class name:",
        "join error"
      )
      consoleSpy.mockRestore()
    })

    it("should return empty array when no matching class name", async () => {
      mock.setResult([])
      const result = await service.getCoefficientsByClassName("Nonexistent")

      expect(result).toEqual([])
    })
  })
})
