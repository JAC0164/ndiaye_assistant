import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"
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

vi.mock("@/src/lib/api-middleware", () => ({
  withAuth: vi.fn().mockResolvedValue({
    supabase: shared.supabase,
    user: { id: "user-1", email: "test@test.com" },
  }),
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

import { GET } from "@/app/api/references/series/route"
import { ReferenceService } from "@/src/services/reference.service"
import { withAuth } from "@/src/lib/api-middleware"
describe("GET /api/references/series", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns all series when level_id is not provided", async () => {
    const mockSeries = [
      { id: "s1", name: "Série A" },
      { id: "s2", name: "Série B" },
    ]
    vi.mocked(ReferenceService).mockImplementation(function () {
      return { getSeries: vi.fn().mockResolvedValue(mockSeries) }
    })

    const request = createMockRequest("GET", { url: "http://localhost:3000/api/references/series" })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual(mockSeries)
  })

  it("filters series by level_id when provided", async () => {
    const mockSeries = [{ id: "s1", name: "Série A", level_id: "l1" }]
    vi.mocked(ReferenceService).mockImplementation(function () {
      return { getSeries: vi.fn().mockResolvedValue(mockSeries) }
    })

    const request = createMockRequest("GET", {
      url: "http://localhost:3000/api/references/series?level_id=l1",
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual(mockSeries)
    expect(ReferenceService).toHaveBeenCalled()
  })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(withAuth).mockResolvedValueOnce({
      error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }),
    })

    const request = createMockRequest("GET")
    const response = await GET(request)

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data).toHaveProperty("error")
  })

  it("returns 500 when service throws", async () => {
    vi.mocked(ReferenceService).mockImplementation(function () {
      return { getSeries: vi.fn().mockRejectedValue(new Error("DB error")) }
    })

    const request = createMockRequest("GET")
    const response = await GET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data).toHaveProperty("error")
  })
})
