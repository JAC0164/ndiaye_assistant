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

vi.mock("@/src/services/session.service", () => ({
  SessionService: vi.fn(function () {
    return { getWeeklyTemplate: vi.fn().mockResolvedValue([]) }
  }),
}))

import { GET } from "@/app/api/planning/sessions/route"
import { SessionService } from "@/src/services/session.service"
import { checkRateLimit } from "@/src/lib/rate-limit"

describe("GET /api/planning/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockImplementation(() => true)
  })

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

  it("returns sessions when authenticated", async () => {
    const userId = "user-123"
    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })

    const mockSessions = [
      { id: "s1", day_of_week: 1, subject: "Maths" },
      { id: "s2", day_of_week: 2, subject: "Français" },
    ]
    vi.mocked(SessionService).mockImplementation(function () {
      return { getWeeklyTemplate: vi.fn().mockResolvedValue(mockSessions) }
    })

    const request = createMockRequest("GET")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual(mockSessions)
    expect(SessionService).toHaveBeenCalled()
  })

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue(false)

    const request = createMockRequest("GET")
    const response = await GET(request)

    expect(response.status).toBe(429)
    const data = await response.json()
    expect(data).toHaveProperty("error")
  })

  it("returns 500 when service throws", async () => {
    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    })
    vi.mocked(SessionService).mockImplementation(function () {
      return { getWeeklyTemplate: vi.fn().mockRejectedValue(new Error("DB error")) }
    })

    const request = createMockRequest("GET")
    const response = await GET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data).toHaveProperty("error")
  })
})
