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

vi.mock("@/src/services/historique.service", () => ({
  HistoriqueService: vi.fn(function () {
    return {
      getWeeklyStats: vi.fn().mockResolvedValue({}),
      logCompletion: vi.fn().mockResolvedValue({}),
    }
  }),
}))

import { GET, POST } from "@/app/api/historique/route"
import { HistoriqueService } from "@/src/services/historique.service"
describe("Historique API", () => {
  const userId = "user-123"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET /api/historique", () => {
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

    it("returns weekly stats when authenticated", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const mockStats = {
        total_sessions: 15,
        total_minutes: 720,
        subjects_breakdown: { Maths: 5, Français: 3 },
      }
      vi.mocked(HistoriqueService).mockImplementation(function () {
        return { getWeeklyStats: vi.fn().mockResolvedValue(mockStats) }
      })

      const request = createMockRequest("GET")
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(mockStats)
    })

    it("returns 500 when service throws", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      vi.mocked(HistoriqueService).mockImplementation(function () {
        return { getWeeklyStats: vi.fn().mockRejectedValue(new Error("DB error")) }
      })

      const request = createMockRequest("GET")
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("POST /api/historique", () => {
    const validBody = {
      subject: "Maths",
      session_type: "td" as const,
      duration_minutes: 90,
      self_rating: 4,
      notes: "Bien compris les fonctions",
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

    it("logs completion with valid body", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const created = { id: "h-new", ...validBody, user_id: userId }
      vi.mocked(HistoriqueService).mockImplementation(function () {
        return { logCompletion: vi.fn().mockResolvedValue(created) }
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
        body: { session_type: "td" },
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when session_type is invalid", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("POST", {
        body: { subject: "Maths", session_type: "invalid" },
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when duration_minutes is out of range", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("POST", {
        body: { subject: "Maths", session_type: "td", duration_minutes: 0 },
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when self_rating is out of range", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const request = createMockRequest("POST", {
        body: { subject: "Maths", session_type: "td", self_rating: 6 },
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("accepts optional session_id as UUID", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      vi.mocked(HistoriqueService).mockImplementation(function () {
        return { logCompletion: vi.fn().mockResolvedValue({ id: "h-1" }) }
      })

      const body = {
        ...validBody,
        session_id: "550e8400-e29b-41d4-a716-446655440000",
      }
      const request = createMockRequest("POST", { body })
      const response = await POST(request)

      expect(response.status).toBe(201)
    })

    it("rejects invalid session_id format", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      const body = { ...validBody, session_id: "not-a-uuid" }
      const request = createMockRequest("POST", { body })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it("returns 500 when logCompletion throws", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      })

      vi.mocked(HistoriqueService).mockImplementation(function () {
        return { logCompletion: vi.fn().mockRejectedValue(new Error("DB error")) }
      })

      const request = createMockRequest("POST", { body: validBody })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })
})
