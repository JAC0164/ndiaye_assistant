import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { createClient } from "@/src/lib/supabase/actions"
import { createSupabaseServerClient } from "@/src/lib/supabase/server-client"

describe("supabase actions client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls createSupabaseServerClient with isReadOnly=false", async () => {
    const mockClient = { from: vi.fn() }
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any)

    const result = await createClient()

    expect(createSupabaseServerClient).toHaveBeenCalledWith(false)
    expect(result).toBe(mockClient)
  })

  it("returns the mocked client", async () => {
    const mockClient = { rpc: vi.fn() }
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any)

    const result = await createClient()

    expect(result).toBe(mockClient)
  })
})
