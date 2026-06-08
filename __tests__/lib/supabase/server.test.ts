import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { createClient } from "@/src/lib/supabase/server"
import { createSupabaseServerClient } from "@/src/lib/supabase/server-client"

describe("supabase server client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls createSupabaseServerClient with isReadOnly=true", async () => {
    const mockClient = { from: vi.fn() }
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any)

    const result = await createClient()

    expect(createSupabaseServerClient).toHaveBeenCalledWith(true)
    expect(result).toBe(mockClient)
  })

  it("returns the mocked client", async () => {
    const mockClient = { schema: vi.fn() }
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockClient as any)

    const result = await createClient()

    expect(result).toBe(mockClient)
  })
})
