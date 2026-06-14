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
    }
  }),
}))

import { GET } from "@/app/api/historique/route"
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
})
