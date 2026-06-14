import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const mockGetUser = vi.hoisted(() => vi.fn())

vi.mock("@/src/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

const mockJson = vi.hoisted(() =>
  vi.fn((body, init) => ({
    status: init?.status ?? 200,
    json: async () => body,
    headers: new Map(),
  }))
)

vi.mock("next/server", () => ({
  NextResponse: {
    json: mockJson,
  },
  NextRequest: vi.fn(),
}))

import { withAuth } from "@/src/lib/api-middleware"

describe("withAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null })
  })

  it("returns user and supabase for valid SSR session", async () => {
    const request = { headers: { get: vi.fn() } } as unknown as NextRequest
    const result = await withAuth(request)

    expect(result).toHaveProperty("user")
    expect(result).toHaveProperty("supabase")
    expect(result.user?.id).toBe("user-1")
  })

  it("returns 401 when SSR has no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("Unauthorized") })
    const request = { headers: { get: vi.fn() } } as unknown as NextRequest
    const result = await withAuth(request)

    expect(result).toHaveProperty("error")
    expect(result.error?.status).toBe(401)
  })

  it("returns user and supabase for valid Bearer token", async () => {
    const request = {
      headers: { get: vi.fn(() => "Bearer valid-token") },
    } as unknown as NextRequest
    const result = await withAuth(request)

    expect(result).toHaveProperty("user")
    expect(result.user?.id).toBe("user-1")
  })

  it("returns 401 when Bearer token is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("Invalid token") })
    const request = {
      headers: { get: vi.fn(() => "Bearer bad-token") },
    } as unknown as NextRequest
    const result = await withAuth(request)

    expect(result).toHaveProperty("error")
    expect(result.error?.status).toBe(401)
  })

  it("returns 500 when Bearer token present but env vars missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    const request = {
      headers: { get: vi.fn(() => "Bearer token") },
    } as unknown as NextRequest

    const result = await withAuth(request)

    expect(result).toHaveProperty("error")
    expect(result.error?.status).toBe(500)
    vi.unstubAllEnvs()
  })
})
