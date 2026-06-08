import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"
import { ReferenceService } from "@/src/services/reference.service"

describe("ReferenceService", () => {
  let mock: ReturnType<typeof createMockSupabase>
  let service: ReferenceService

  beforeEach(() => {
    mock = createMockSupabase()
    service = new ReferenceService(mock.supabase)
    vi.clearAllMocks()
  })

  describe("getLevels", () => {
    const levels = [
      { id: "1", name: "College", sort_order: 1, created_at: "", updated_at: "" },
      { id: "2", name: "Lycée", sort_order: 2, created_at: "", updated_at: "" },
    ]

    it("should fetch school_levels ordered by sort_order", async () => {
      mock.setResult(levels)
      const result = await service.getLevels()

      expect(result).toEqual(levels)
      expect(mock.supabase.from).toHaveBeenCalledWith("school_levels")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.order).toHaveBeenCalledWith("sort_order", { ascending: true })
    })

    it("should return empty array when no levels", async () => {
      mock.setResult([])
      const result = await service.getLevels()

      expect(result).toEqual([])
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("levels error"))
      })
      await expect(service.getLevels()).rejects.toThrow("levels error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("db error") })
      })
      await expect(service.getLevels()).rejects.toThrow(
        "Erreur lors du chargement des niveaux: db error"
      )
    })
  })

  describe("getSeries", () => {
    const series = [
      { id: "1", name: "S1", description: null, level_id: "lv-1", created_at: "", updated_at: "" },
      { id: "2", name: "S2", description: null, level_id: "lv-1", created_at: "", updated_at: "" },
    ]

    it("should fetch series ordered by name without filter", async () => {
      mock.setResult(series)
      const result = await service.getSeries()

      expect(result).toEqual(series)
      expect(mock.supabase.from).toHaveBeenCalledWith("series")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.order).toHaveBeenCalledWith("name", { ascending: true })
    })

    it("should filter by level_id when provided", async () => {
      mock.setResult(series)
      const result = await service.getSeries("lv-1")

      expect(result).toEqual(series)
      expect(mock.builder.eq).toHaveBeenCalledWith("level_id", "lv-1")
    })

    it("should return empty array when no series", async () => {
      mock.setResult([])
      const result = await service.getSeries()

      expect(result).toEqual([])
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("series error"))
      })
      await expect(service.getSeries()).rejects.toThrow("series error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("series db error") })
      })
      await expect(service.getSeries()).rejects.toThrow(
        "Erreur lors du chargement des séries: series db error"
      )
    })
  })

  describe("getClasses", () => {
    const classes = [
      {
        id: "cls-1",
        name: "Terminale S1",
        level_id: "lv-1",
        series_id: "s-1",
        created_at: "",
        updated_at: "",
      },
      {
        id: "cls-2",
        name: "Terminale S2",
        level_id: "lv-1",
        series_id: "s-2",
        created_at: "",
        updated_at: "",
      },
    ]

    it("should fetch classes with joins ordered by name", async () => {
      mock.setResult(classes)
      const result = await service.getClasses()

      expect(result).toEqual(classes)
      expect(mock.supabase.from).toHaveBeenCalledWith("classes")
      expect(mock.builder.select).toHaveBeenCalledWith("*, series(name), school_levels!inner(name)")
      expect(mock.builder.order).toHaveBeenCalledWith("name", { ascending: true })
    })

    it("should filter by level_id when provided", async () => {
      mock.setResult(classes)
      await service.getClasses("lv-1")

      expect(mock.builder.eq).toHaveBeenCalledWith("level_id", "lv-1")
    })

    it("should filter by series_id when provided", async () => {
      mock.setResult(classes)
      await service.getClasses(undefined, "s-1")

      expect(mock.builder.eq).toHaveBeenCalledWith("series_id", "s-1")
    })

    it("should filter by both level_id and series_id when both provided", async () => {
      mock.setResult(classes)
      await service.getClasses("lv-1", "s-1")

      expect(mock.builder.eq).toHaveBeenCalledWith("level_id", "lv-1")
      expect(mock.builder.eq).toHaveBeenCalledWith("series_id", "s-1")
    })

    it("should return empty array when no classes", async () => {
      mock.setResult([])
      const result = await service.getClasses()

      expect(result).toEqual([])
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("classes error"))
      })
      await expect(service.getClasses()).rejects.toThrow("classes error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("classes db error") })
      })
      await expect(service.getClasses()).rejects.toThrow(
        "Erreur lors du chargement des classes: classes db error"
      )
    })
  })

  describe("getCoefficients", () => {
    const coefficients = [
      {
        id: "c-1",
        class_id: "cls-1",
        subject: "Maths",
        coefficient: 5,
        created_at: "",
        updated_at: "",
      },
      {
        id: "c-2",
        class_id: "cls-1",
        subject: "Physics",
        coefficient: 4,
        created_at: "",
        updated_at: "",
      },
    ]

    it("should fetch all coefficients ordered by coefficient descending when no filter", async () => {
      mock.setResult(coefficients)
      const result = await service.getCoefficients()

      expect(result).toEqual(coefficients)
      expect(mock.supabase.from).toHaveBeenCalledWith("coefficients")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.order).toHaveBeenCalledWith("coefficient", { ascending: false })
    })

    it("should filter by class_id when provided", async () => {
      mock.setResult(coefficients)
      await service.getCoefficients("cls-1")

      expect(mock.builder.eq).toHaveBeenCalledWith("class_id", "cls-1")
    })

    it("should fetch with inner join by className when className is provided", async () => {
      const coeffWithClassName = coefficients.map((c) => ({
        ...c,
        classes: { name: "Terminale S1" },
      }))
      mock.setResult(coeffWithClassName)
      const result = await service.getCoefficients(undefined, "Terminale S1")

      expect(result).toEqual(coeffWithClassName)
      expect(mock.supabase.from).toHaveBeenCalledWith("coefficients")
      expect(mock.builder.select).toHaveBeenCalledWith("*, classes!inner(name)")
      expect(mock.builder.eq).toHaveBeenCalledWith("classes.name", "Terminale S1")
      expect(mock.builder.order).toHaveBeenCalledWith("coefficient", { ascending: false })
    })

    it("should ignore classId when className is provided", async () => {
      mock.setResult(coefficients)
      await service.getCoefficients("cls-1", "Terminale S1")

      expect(mock.builder.select).toHaveBeenCalledWith("*, classes!inner(name)")
      expect(mock.builder.eq).toHaveBeenCalledWith("classes.name", "Terminale S1")
      expect(mock.builder.eq).not.toHaveBeenCalledWith("class_id", "cls-1")
    })

    it("should return empty array when no coefficients", async () => {
      mock.setResult([])
      const result = await service.getCoefficients()

      expect(result).toEqual([])
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("coeff error"))
      })
      await expect(service.getCoefficients()).rejects.toThrow("coeff error")
    })

    it("should throw with wrapped message when className query returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("coeff by name error") })
      })
      await expect(service.getCoefficients(undefined, "Terminale S1")).rejects.toThrow(
        "Erreur lors du chargement des coefficients: coeff by name error"
      )
    })

    it("should throw with wrapped message when no-className query returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("coeff all error") })
      })
      await expect(service.getCoefficients()).rejects.toThrow(
        "Erreur lors du chargement des coefficients: coeff all error"
      )
    })
  })
})
