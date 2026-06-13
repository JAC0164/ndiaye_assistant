import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(),
}))

import { createClient } from "@/src/lib/supabase/client"
import { createBrowserClient } from "@supabase/ssr"

describe("supabase browser client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")
  })

  it("calls createBrowserClient with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY", () => {
    createClient()
    expect(createBrowserClient).toHaveBeenCalledWith("https://test.supabase.co", "test-anon-key")
  })

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    expect(() => createClient()).toThrow(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  })

  it("throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    expect(() => createClient()).toThrow(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  })

  it("returns the mocked client from createBrowserClient", () => {
    const mockClient = { from: vi.fn() }
    vi.mocked(createBrowserClient).mockReturnValue(mockClient as any)
    const result = createClient()
    expect(result).toBe(mockClient)
  })
})
