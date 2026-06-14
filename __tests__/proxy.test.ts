import { describe, it, expect, vi, beforeEach } from "vitest"
import { proxy, config } from "../proxy"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"

const mockGetUser = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn((init?: { request?: { headers: Headers } }) => ({
      cookies: { set: vi.fn(), get: vi.fn(), getAll: vi.fn(() => []), has: vi.fn(), delete: vi.fn() },
      headers: init?.request?.headers ?? new Headers(),
    })),
    json: vi.fn(),
    redirect: vi.fn((url) => ({ status: 307, headers: new Headers({ Location: url.toString() }) })),
  },
  NextRequest: vi.fn(),
}))

function createMockRequest(): NextRequest {
  const cookieMap = new Map<string, string>()
  return {
    cookies: {
      get: vi.fn((name: string) => ({ name, value: cookieMap.get(name) ?? "" })),
      set: vi.fn((name: string, value: string) => {
        cookieMap.set(name, value)
      }),
      getAll: vi.fn(() => Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }))),
      has: vi.fn((name: string) => cookieMap.has(name)),
      delete: vi.fn((name: string) => {
        cookieMap.delete(name)
      }),
    },
    headers: new Headers({ "content-type": "application/json" }),
    nextUrl: {
      ...new URL("http://localhost:3000/dashboard"),
      clone: () => new URL("http://localhost:3000/auth"),
    } as unknown as URL,
    url: "http://localhost:3000/dashboard",
  } as unknown as NextRequest
}

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null })
  })

  afterEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")
  })

  it("creates a Supabase server client with correct env vars", async () => {
    const request = createMockRequest()
    await proxy(request)

    expect(createServerClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        cookies: {
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        },
      })
    )
  })

  it("calls supabase.auth.getUser() to refresh the session", async () => {
    const request = createMockRequest()
    await proxy(request)

    expect(mockGetUser).toHaveBeenCalledTimes(1)
  })

  it("returns the response from NextResponse.next", async () => {
    const request = createMockRequest()
    const result = await proxy(request)

    expect(NextResponse.next).toHaveBeenCalledTimes(1)
    expect(result).toEqual(
      expect.objectContaining({
        cookies: expect.any(Object),
        headers: expect.any(Headers),
      })
    )
  })

  it("reads cookies from the request via getAll", async () => {
    const request = createMockRequest()
    request.cookies.getAll = vi.fn(() => [{ name: "sb-access-token", value: "existing-token" }])

    await proxy(request)

    const mockCall = vi.mocked(createServerClient).mock.calls[0]
    const cookiesConfig = mockCall[2] as { cookies: { getAll: () => Array<{ name: string; value: string }> } }
    const result = cookiesConfig.cookies.getAll()

    expect(request.cookies.getAll).toHaveBeenCalled()
    expect(result).toEqual([{ name: "sb-access-token", value: "existing-token" }])
  })

  it("handles setAll by creating a new response and setting cookies", async () => {
    const request = createMockRequest()
    await proxy(request)

    const mockCall = vi.mocked(createServerClient).mock.calls[0]
    const cookiesConfig = mockCall[2] as {
      cookies: { setAll: (cookies: Array<{ name: string; value: string; options?: Record<string, string> }>) => void }
    }

    const cookiesToSet = [
      { name: "access_token", value: "new-token" },
      { name: "refresh_token", value: "new-refresh", options: { path: "/" } },
    ]
    cookiesConfig.cookies.setAll(cookiesToSet)

    expect(NextResponse.next).toHaveBeenCalledTimes(2)
  })

  it("passes request headers to NextResponse.next", async () => {
    const request = createMockRequest()
    await proxy(request)

    expect(NextResponse.next).toHaveBeenCalledWith({
      request: {
        headers: request.headers,
      },
    })
  })

  it("works when auth.getUser resolves successfully", async () => {
    const request = createMockRequest()
    const result = await proxy(request)

    expect(mockGetUser).toHaveBeenCalled()
    expect(result).toBeDefined()
  })

  it("handles auth failure gracefully (getUser returns error)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("Unauthorized") })

    const request = createMockRequest()
    const result = await proxy(request)

    expect(NextResponse.redirect).toHaveBeenCalled()
  })

  it("handles auth rejection gracefully (getUser throws)", async () => {
    mockGetUser.mockRejectedValue(new Error("Network error"))

    const request = createMockRequest()
    await expect(proxy(request)).rejects.toThrow("Network error")
  })

  it("throws when NEXT_PUBLIC_SUPABASE_URL env var is missing (requireEnv)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    const request = createMockRequest()
    await expect(proxy(request)).rejects.toThrow("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL")
  })

  it("throws when NEXT_PUBLIC_SUPABASE_ANON_KEY env var is missing (requireEnv)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    const request = createMockRequest()
    await expect(proxy(request)).rejects.toThrow("Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY")
  })

  it("forwards cookies from request to supabase on read", async () => {
    const request = createMockRequest()
    request.cookies.getAll = vi.fn(() => [{ name: "sb-access-token", value: "existing-token" }])

    await proxy(request)

    const mockCall = vi.mocked(createServerClient).mock.calls[0]
    const cookiesConfig = mockCall[2] as { cookies: { getAll: () => Array<{ name: string; value: string }> } }
    const result = cookiesConfig.cookies.getAll()

    expect(request.cookies.getAll).toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("sb-access-token")
  })
})

describe("proxy config", () => {
  it("has a matcher that excludes _next/static, _next/image, favicon.ico, and api/", () => {
    expect(config).toBeDefined()
    expect(config.matcher).toHaveLength(1)
    expect(config.matcher[0]).toBe("/((?!_next/static|_next/image|favicon.ico|api/|auth|.*\\..*).*)")
  })

  it("matcher pattern contains all expected exclusion terms", () => {
    expect(config.matcher[0]).toContain("_next/static")
    expect(config.matcher[0]).toContain("_next/image")
    expect(config.matcher[0]).toContain("favicon.ico")
    expect(config.matcher[0]).toContain("api/")
  })
})
