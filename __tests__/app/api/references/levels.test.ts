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

vi.mock("@/src/services/reference.service", () => ({
  ReferenceService: vi.fn(function () {
    return {
      getLevels: vi.fn().mockResolvedValue([]),
      getSeries: vi.fn().mockResolvedValue([]),
      getClasses: vi.fn().mockResolvedValue([]),
      getCoefficients: vi.fn().mockResolvedValue([]),
    }
  }),
}))

import { GET } from "@/app/api/references/levels/route"
import { ReferenceService } from "@/src/services/reference.service"
import { checkRateLimit } from "@/src/lib/rate-limit"

describe("GET /api/references/levels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockImplementation(() => true)
  })

  it("returns JSON with all school levels", async () => {
    const mockLevels = [{ id: "1", name: "Primaire" }, { id: "2", name: "Secondaire" }]
    vi.mocked(ReferenceService).mockImplementation(function () {
      return { getLevels: vi.fn().mockResolvedValue(mockLevels) }
    })

    const request = createMockRequest("GET")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual(mockLevels)
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
    vi.mocked(ReferenceService).mockImplementation(function () {
      return { getLevels: vi.fn().mockRejectedValue(new Error("DB error")) }
    })

    const request = createMockRequest("GET")
    const response = await GET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data).toHaveProperty("error")
  })
})
