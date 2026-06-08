import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"
import { BaseService, QueryOptions } from "@/src/services/base.service"

class ConcreteService extends BaseService<Record<string, unknown>> {
  constructor(supabase: ReturnType<typeof createMockSupabase>["supabase"]) {
    super(supabase, "test_table")
  }
}

describe("BaseService", () => {
  let mock: ReturnType<typeof createMockSupabase>
  let service: ConcreteService

  beforeEach(() => {
    mock = createMockSupabase()
    service = new ConcreteService(mock.supabase)
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should store supabase instance", () => {
      expect(service["supabase"]).toBe(mock.supabase)
    })

    it("should store tableName", () => {
      expect(service["tableName"]).toBe("test_table")
    })
  })

  describe("getAll", () => {
    const records = [{ id: "1", name: "alpha" }, { id: "2", name: "beta" }]

    it("should call select on the correct table and return data", async () => {
      mock.setResult(records)
      const result = await service.getAll()

      expect(result).toEqual(records)
      expect(mock.supabase.from).toHaveBeenCalledWith("test_table")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
    })

    it("should apply userId filter when provided", async () => {
      mock.setResult(records)
      await service.getAll("user-1")

      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
    })

    it("should not call eq when userId is not provided", async () => {
      mock.setResult(records)
      await service.getAll()

      expect(mock.builder.eq).not.toHaveBeenCalled()
    })

    it("should apply orderBy option", async () => {
      mock.setResult(records)
      await service.getAll(undefined, { orderBy: { column: "name", ascending: true } })

      expect(mock.builder.order).toHaveBeenCalledWith("name", { ascending: true })
    })

    it("should apply limit option", async () => {
      mock.setResult(records)
      await service.getAll(undefined, { limit: 10 })

      expect(mock.builder.limit).toHaveBeenCalledWith(10)
    })

    it("should apply offset with range using default limit when no limit given", async () => {
      mock.setResult(records)
      await service.getAll(undefined, { offset: 5 })

      expect(mock.builder.range).toHaveBeenCalledWith(5, 54)
    })

    it("should apply offset with custom limit in range", async () => {
      mock.setResult(records)
      await service.getAll(undefined, { offset: 5, limit: 20 })

      expect(mock.builder.range).toHaveBeenCalledWith(5, 24)
    })

    it("should apply all QueryOptions in combination", async () => {
      mock.setResult(records)
      const opts: QueryOptions = {
        limit: 5,
        offset: 2,
        orderBy: { column: "id", ascending: false },
      }
      await service.getAll("user-1", opts)

      expect(mock.builder.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mock.builder.order).toHaveBeenCalledWith("id", { ascending: false })
      expect(mock.builder.limit).toHaveBeenCalledWith(5)
      expect(mock.builder.range).toHaveBeenCalledWith(2, 6)
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("connection refused"))
      })
      await expect(service.getAll()).rejects.toThrow("connection refused")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("DB error") })
      })
      await expect(service.getAll()).rejects.toThrow(
        "Erreur lors de la récupération des données: DB error"
      )
    })
  })

  describe("getById", () => {
    const record = { id: "42", name: "target" }

    it("should select * with eq id and single, returning the record", async () => {
      mock.setResult(record)
      const result = await service.getById("42")

      expect(result).toEqual(record)
      expect(mock.supabase.from).toHaveBeenCalledWith("test_table")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.eq).toHaveBeenCalledWith("id", "42")
      expect(mock.builder.single).toHaveBeenCalled()
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("item not found"))
      })
      await expect(service.getById("99")).rejects.toThrow("item not found")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("not found") })
      })
      await expect(service.getById("42")).rejects.toThrow(
        "Erreur lors de la récupération de l'élément: not found"
      )
    })
  })

  describe("create", () => {
    const payload = { name: "new record", value: 42 }
    const created = { id: "1", ...payload }

    it("should insert payload, select, single and return created record", async () => {
      mock.setResult(created)
      const result = await service.create(payload)

      expect(result).toEqual(created)
      expect(mock.supabase.from).toHaveBeenCalledWith("test_table")
      expect(mock.builder.insert).toHaveBeenCalledWith(payload)
      expect(mock.builder.select).toHaveBeenCalled()
      expect(mock.builder.single).toHaveBeenCalled()
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("insert failed"))
      })
      await expect(service.create(payload)).rejects.toThrow("insert failed")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("insert failed") })
      })
      await expect(service.create({ name: "test" })).rejects.toThrow(
        "Erreur lors de la création: insert failed"
      )
    })
  })

  describe("update", () => {
    const payload = { name: "updated" }
    const updated = { id: "1", name: "updated" }

    it("should update with eq id, select, single and return updated record", async () => {
      mock.setResult(updated)
      const result = await service.update("1", payload)

      expect(result).toEqual(updated)
      expect(mock.supabase.from).toHaveBeenCalledWith("test_table")
      expect(mock.builder.update).toHaveBeenCalledWith(payload)
      expect(mock.builder.eq).toHaveBeenCalledWith("id", "1")
      expect(mock.builder.select).toHaveBeenCalled()
      expect(mock.builder.single).toHaveBeenCalled()
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("update failed"))
      })
      await expect(service.update("1", payload)).rejects.toThrow("update failed")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("update failed") })
      })
      await expect(service.update("1", { name: "test" })).rejects.toThrow(
        "Erreur lors de la mise à jour: update failed"
      )
    })
  })

  describe("delete", () => {
    it("should delete with eq id", async () => {
      mock.setResult(null)
      await service.delete("1")

      expect(mock.supabase.from).toHaveBeenCalledWith("test_table")
      expect(mock.builder.delete).toHaveBeenCalled()
      expect(mock.builder.eq).toHaveBeenCalledWith("id", "1")
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("delete forbidden"))
      })
      await expect(service.delete("1")).rejects.toThrow("delete forbidden")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("delete failed") })
      })
      await expect(service.delete("1")).rejects.toThrow(
        "Erreur lors de la suppression: delete failed"
      )
    })
  })
})
