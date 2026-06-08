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

vi.mock("@/src/lib/langgraph/nodes/profileAgent", () => ({
  profileAgent: vi.fn(),
}))

vi.mock("@/src/services/profile.service", () => ({
  ProfileService: vi.fn(function () {
    return { saveProfileCache: vi.fn().mockResolvedValue(null) }
  }),
}))

import { POST } from "@/app/api/agents/profile/route"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { profileAgent } from "@/src/lib/langgraph/nodes/profileAgent"
import { ProfileService } from "@/src/services/profile.service"

describe("POST /api/agents/profile", () => {
  const userId = "user-123"

  beforeEach(() => {
    vi.clearAllMocks()
    shared.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })
  })

  describe("Authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Not authenticated"),
      })

      const request = createMockRequest("POST", {
        body: { onboardingData: { class_name: "Terminale S" } },
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("Input validation", () => {
    it("returns 500 when onboardingData is missing and agent fails", async () => {
      const request = createMockRequest("POST", { body: {} })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when body is invalid JSON", async () => {
      const request = createMockRequest("POST")
      request.json = vi.fn().mockRejectedValue(new Error("Invalid JSON"))

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("Success path", () => {
    it("runs profile agent and returns student profile", async () => {
      const mockResult = { studentProfileContext: "Élève en Terminale S, série scientifique" }
      vi.mocked(profileAgent).mockResolvedValue(mockResult as never)

      const onboardingData = { class_name: "Terminale S", series_name: "S" }
      const request = createMockRequest("POST", { body: { onboardingData } })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ studentProfileContext: mockResult.studentProfileContext })
    })

    it("saves profile cache after successful analysis", async () => {
      vi.mocked(profileAgent).mockResolvedValue({
        studentProfileContext: "Profil élève scientifique",
      } as never)

      const mockSaveProfileCache = vi.fn().mockResolvedValue(null)
      vi.mocked(ProfileService).mockImplementation(function () {
        return { saveProfileCache: mockSaveProfileCache }
      })

      const request = createMockRequest("POST", {
        body: { onboardingData: { class_name: "Terminale S" } },
      })
      await POST(request)

      expect(mockSaveProfileCache).toHaveBeenCalledWith(
        userId,
        "Profil élève scientifique"
      )
    })

    it("defaults onboardingData to empty object when not provided", async () => {
      vi.mocked(profileAgent).mockResolvedValue({
        studentProfileContext: "Default profile",
      } as never)

      const request = createMockRequest("POST", { body: { onboardingData: {} } })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })
  })

  describe("Error handling", () => {
    it("returns 500 when profile agent throws", async () => {
      vi.mocked(profileAgent).mockRejectedValue(new Error("Profile agent failure"))

      const request = createMockRequest("POST", {
        body: { onboardingData: { class_name: "Terminale S" } },
      })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("handles undefined studentProfileContext with fallback default", async () => {
      vi.mocked(profileAgent).mockResolvedValue({
        studentProfileContext: undefined,
      } as never)

      const request = createMockRequest("POST", {
        body: { onboardingData: { class_name: "Terminale S" } },
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })
  })

  describe("Rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      vi.mocked(checkRateLimit).mockReturnValue(false)

      const request = createMockRequest("POST", { body: {} })
      const response = await POST(request)

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })
})
