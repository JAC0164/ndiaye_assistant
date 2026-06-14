import { describe, it, expect, vi, beforeEach } from "vitest"

const mockCreateServerClient = vi.hoisted(() => vi.fn())
const mockGetAll = vi.hoisted(() => vi.fn(() => []))
const mockSet = vi.hoisted(() => vi.fn())
const mockCookieStore = vi.hoisted(() => ({ getAll: mockGetAll, set: mockSet }))

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => mockCookieStore),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}))

import { createSupabaseServerClient } from "@/src/lib/supabase/server-client"

describe("createSupabaseServerClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")
  })

  it("creates a client with cookie handling", async () => {
    mockCreateServerClient.mockReturnValue({ mock: "client" })

    const client = await createSupabaseServerClient()

    expect(client).toEqual({ mock: "client" })
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      })
    )
  })

  it("creates a read-only client that skips cookie setting", async () => {
    mockCreateServerClient.mockImplementation((_url, _key, opts) => {
      opts.cookies.setAll([{ name: "test", value: "val", options: {} }])
      return { mock: "readonly" }
    })

    await createSupabaseServerClient(true)
    expect(mockSet).not.toHaveBeenCalled()
  })

  it("throws when SUPABASE_URL is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")

    mockCreateServerClient.mockImplementation(() => {
      throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL")
    })

    await expect(createSupabaseServerClient()).rejects.toThrow("NEXT_PUBLIC_SUPABASE_URL")
  })

  it("reads all cookies via getAll", async () => {
    const fakeCookies = [{ name: "sb-session", value: "xyz" }]
    mockGetAll.mockReturnValue(fakeCookies)

    let capturedGetAll: (() => typeof fakeCookies) | null = null
    mockCreateServerClient.mockImplementation((_url, _key, opts) => {
      capturedGetAll = opts.cookies.getAll
      return {}
    })

    await createSupabaseServerClient()
    const result = capturedGetAll!()
    expect(result).toEqual(fakeCookies)
  })

  it("calls cookieStore.set for each cookie in setAll", async () => {
    const cookiesToSet = [
      { name: "a", value: "1", options: { path: "/" } },
      { name: "b", value: "2", options: {} },
    ]

    mockCreateServerClient.mockImplementation((_url, _key, opts) => {
      opts.cookies.setAll(cookiesToSet)
      return {}
    })

    await createSupabaseServerClient(false)
    expect(mockSet).toHaveBeenCalledTimes(2)
    expect(mockSet).toHaveBeenCalledWith("a", "1", { path: "/" })
    expect(mockSet).toHaveBeenCalledWith("b", "2", {})
  })

  it("silently catches errors in setAll (read-only fallback path)", async () => {
    mockSet.mockImplementation(() => {
      throw new Error("cannot set in this context")
    })

    const cookiesToSet = [{ name: "x", value: "y", options: {} }]
    mockCreateServerClient.mockImplementation((_url, _key, opts) => {
      opts.cookies.setAll(cookiesToSet)
      return {}
    })

    await expect(createSupabaseServerClient(false)).resolves.toBeDefined()
  })

  it("does not call set when isReadOnly is true", async () => {
    mockCreateServerClient.mockImplementation((_url, _key, opts) => {
      opts.cookies.setAll([{ name: "x", value: "y", options: {} }])
      return {}
    })

    await createSupabaseServerClient(true)
    expect(mockSet).not.toHaveBeenCalled()
  })
})
