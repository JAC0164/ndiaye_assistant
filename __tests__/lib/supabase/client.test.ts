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

  it("calls createBrowserClient with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY", () => {
    createClient()
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key"
    )
  })

  it("returns the mocked client from createBrowserClient", () => {
    const mockClient = { from: vi.fn() }
    vi.mocked(createBrowserClient).mockReturnValue(mockClient as any)
    const result = createClient()
    expect(result).toBe(mockClient)
  })
})
