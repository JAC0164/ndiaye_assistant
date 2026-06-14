import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockRequest } from "@/src/test/utils/mock-request"

const shared = vi.hoisted(() => {
  const supabase = {
    from: vi.fn(),
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
  return { supabase }
})

vi.mock("@/src/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(shared.supabase),
}))

vi.mock("@/src/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => true),
}))

vi.mock("@/src/services/echeance.service", () => ({
  EcheanceService: vi.fn(function () {
    return {
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(null),
    }
  }),
}))

import { PATCH, DELETE } from "@/app/api/echeances/[id]/route"
import { EcheanceService } from "@/src/services/echeance.service"
import { checkRateLimit } from "@/src/lib/rate-limit"

describe("Echéance [id] API", () => {
  const userId = "user-123"
  const echeanceId = "echeance-1"
  const params = Promise.resolve({ id: echeanceId })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("PATCH /api/echeances/[id]", () => {
    it("returns 401 when user is not authenticated", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      })

      const request = createMockRequest("PATCH", { body: { title: "Updated" } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("updates echeance when authenticated with valid body", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const updated = { id: echeanceId, subject: "Maths", title: "Updated Title", is_completed: true }
      vi.mocked(EcheanceService).mockImplementation(function () {
        return { update: vi.fn().mockResolvedValue(updated) }
      })

      const request = createMockRequest("PATCH", {
        body: { title: "Updated Title", is_completed: true },
      })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(updated)
    })

    it("returns 500 when service throws", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      vi.mocked(EcheanceService).mockImplementation(function () {
        return { update: vi.fn().mockRejectedValue(new Error("DB error")) }
      })

      const request = createMockRequest("PATCH", { body: { title: "test" } })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(500)
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
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when body contains invalid fields", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("PATCH", {
        body: { subject: "", title: "" },
      })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 for invalid echeance_type", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("PATCH", {
        body: { echeance_type: "quiz" },
      })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 for invalid due_date format", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("PATCH", {
        body: { due_date: "15-06-2026" },
      })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("DELETE /api/echeances/[id]", () => {
    it("returns 401 when user is not authenticated", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      })

      const request = createMockRequest("DELETE")
      const response = await DELETE(request, { params })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("deletes echeance when authenticated", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      vi.mocked(EcheanceService).mockImplementation(function () {
        return { delete: vi.fn().mockResolvedValue(null) }
      })

      const request = createMockRequest("DELETE")
      const response = await DELETE(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ success: true })
    })

    it("returns 500 when delete service throws", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      vi.mocked(EcheanceService).mockImplementation(function () {
        return { delete: vi.fn().mockRejectedValue(new Error("DB error")) }
      })

      const request = createMockRequest("DELETE")
      const response = await DELETE(request, { params })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("Rate limiting", () => {
    it("returns 429 for PATCH when rate limit is exceeded", async () => {
      vi.mocked(checkRateLimit).mockReturnValue(false)

      const request = createMockRequest("PATCH")
      const response = await PATCH(request, { params })

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 429 for DELETE when rate limit is exceeded", async () => {
      vi.mocked(checkRateLimit).mockReturnValue(false)

      const request = createMockRequest("DELETE")
      const response = await DELETE(request, { params })

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })
})
