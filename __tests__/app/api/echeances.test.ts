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
      getUpcoming: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    }
  }),
}))

import { GET, POST } from "@/app/api/echeances/route"
import { EcheanceService } from "@/src/services/echeance.service"
import { checkRateLimit } from "@/src/lib/rate-limit"

describe("Echéances API", () => {
  const userId = "user-123"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET /api/echeances", () => {
    it("returns 401 when user is not authenticated", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      })

      const request = createMockRequest("GET")
      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns echeances when authenticated", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const mockEcheances = [
        { id: "e1", subject: "Maths", title: "Devoir 1", due_date: "2026-06-15" },
      ]
      vi.mocked(EcheanceService).mockImplementation(function () {
        return { getUpcoming: vi.fn().mockResolvedValue(mockEcheances) }
      })

      const request = createMockRequest("GET", {
        url: "http://localhost:3000/api/echeances",
      })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(mockEcheances)
    })

    it("accepts days query param (1-90 range)", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const mockGetUpcoming = vi.fn().mockResolvedValue([])
      vi.mocked(EcheanceService).mockImplementation(function () {
        return { getUpcoming: mockGetUpcoming }
      })

      await GET(createMockRequest("GET", {
        url: "http://localhost:3000/api/echeances?days=30",
      }))

      expect(mockGetUpcoming).toHaveBeenCalledWith(userId, 30)
    })

    it("defaults to 14 when days=0 (falsy fallback)", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const mockGetUpcoming = vi.fn().mockResolvedValue([])
      vi.mocked(EcheanceService).mockImplementation(function () {
        return { getUpcoming: mockGetUpcoming }
      })

      await GET(createMockRequest("GET", {
        url: "http://localhost:3000/api/echeances?days=0",
      }))

      expect(mockGetUpcoming).toHaveBeenCalledWith(userId, 14)
    })

    it("clamps days to maximum 90 when above 90", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const mockGetUpcoming = vi.fn().mockResolvedValue([])
      vi.mocked(EcheanceService).mockImplementation(function () {
        return { getUpcoming: mockGetUpcoming }
      })

      await GET(createMockRequest("GET", {
        url: "http://localhost:3000/api/echeances?days=100",
      }))

      expect(mockGetUpcoming).toHaveBeenCalledWith(userId, 90)
    })

    it("defaults to 14 days when days param is missing", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const mockGetUpcoming = vi.fn().mockResolvedValue([])
      vi.mocked(EcheanceService).mockImplementation(function () {
        return { getUpcoming: mockGetUpcoming }
      })

      await GET(createMockRequest("GET", {
        url: "http://localhost:3000/api/echeances",
      }))

      expect(mockGetUpcoming).toHaveBeenCalledWith(userId, 14)
    })

    it("returns 500 when getUpcoming throws", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      vi.mocked(EcheanceService).mockImplementation(function () {
        return { getUpcoming: vi.fn().mockRejectedValue(new Error("DB error")) }
      })

      const request = createMockRequest("GET")
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("POST /api/echeances", () => {
    const validBody = {
      subject: "Maths",
      title: "Devoir 1",
      description: "Réviser les fonctions",
      due_date: "2026-06-15",
      echeance_type: "devoir" as const,
    }

    it("returns 401 when user is not authenticated", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      })

      const request = createMockRequest("POST", { body: validBody })
      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("creates echeance with valid body", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const created = { id: "e-new", ...validBody, user_id: userId }
      vi.mocked(EcheanceService).mockImplementation(function () {
        return { create: vi.fn().mockResolvedValue(created) }
      })

      const request = createMockRequest("POST", { body: validBody })
      const response = await POST(request)

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data).toEqual(created)
    })

    it("returns 400 when body is invalid JSON", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("POST")
      request.json = vi.fn().mockRejectedValue(new Error("Invalid JSON"))

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when subject is missing", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("POST", {
        body: { title: "Test", due_date: "2026-06-15", echeance_type: "devoir" },
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when due_date has wrong format", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("POST", {
        body: {
          subject: "Maths",
          title: "Test",
          due_date: "not-a-date",
          echeance_type: "devoir",
        },
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when echeance_type is invalid", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("POST", {
        body: {
          subject: "Maths",
          title: "Test",
          due_date: "2026-06-15",
          echeance_type: "invalid_type",
        },
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 500 when create throws", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      vi.mocked(EcheanceService).mockImplementation(function () {
        return { create: vi.fn().mockRejectedValue(new Error("DB error")) }
      })

      const request = createMockRequest("POST", { body: validBody })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("Rate limiting", () => {
    it("returns 429 for GET when rate limit is exceeded", async () => {
      vi.mocked(checkRateLimit).mockReturnValue(false)

      const request = createMockRequest("GET")
      const response = await GET(request)

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 429 for POST when rate limit is exceeded", async () => {
      vi.mocked(checkRateLimit).mockReturnValue(false)

      const request = createMockRequest("POST")
      const response = await POST(request)

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })
})
