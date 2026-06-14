import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockRequest } from "@/src/test/utils/mock-request"

const mockExchangeCodeForSession = vi.hoisted(() => vi.fn())
const mockSupabase = vi.hoisted(() => ({
  auth: { getUser: vi.fn(), exchangeCodeForSession: mockExchangeCodeForSession },
}))

vi.mock("@/src/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: vi.fn((url: string) => ({
      status: 307,
      url,
      headers: new Map(),
    })),
  },
  NextRequest: vi.fn(),
}))

import { GET } from "@/app/auth/callback/route"

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exchanges code and redirects to planning when successful", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const request = createMockRequest("GET", { url: "http://localhost:3000/auth/callback?code=abc123" })
    const response = await GET(request)

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc123")
    expect(response.status).toBe(307)
    expect(response.url).toContain("/planning")
  })

  it("redirects to custom next path when provided", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const request = createMockRequest("GET", {
      url: "http://localhost:3000/auth/callback?code=xyz&next=/custom",
    })
    const response = await GET(request)

    expect(response.url).toContain("/custom")
  })

  it("redirects to auth error page when code exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: new Error("Invalid code") })

    const request = createMockRequest("GET", { url: "http://localhost:3000/auth/callback?code=badcode" })
    const response = await GET(request)

    expect(response.url).toContain("/auth?error=auth_callback_error")
  })

  it("redirects to auth error page when no code is provided", async () => {
    const request = createMockRequest("GET", { url: "http://localhost:3000/auth/callback" })
    const response = await GET(request)

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
    expect(response.url).toContain("/auth?error=auth_callback_error")
  })
})
