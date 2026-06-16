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

vi.mock("@/src/lib/langgraph/nodes/visionAgent", () => ({
  visionAgent: vi.fn(),
}))

vi.mock("@/src/services/profile.service", () => ({
  ProfileService: vi.fn(function () {
    return { saveVisionCache: vi.fn().mockResolvedValue(null) }
  }),
}))

import { POST } from "@/app/api/agents/vision/route"
import { visionAgent } from "@/src/lib/langgraph/nodes/visionAgent"
import { ProfileService } from "@/src/services/profile.service"

function createImageFormData(file?: Partial<File>): FormData {
  const imageFile = new File(
    [file?.size ? new ArrayBuffer(file.size) : new ArrayBuffer(2048)],
    file?.name ?? "timetable.jpg",
    { type: file?.type ?? "image/jpeg" }
  )
  const fd = new FormData()
  fd.append("timetableImage", imageFile)
  return fd
}

describe("POST /api/agents/vision", () => {
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

      const request = createMockRequest("POST", { formData: createImageFormData() })
      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("Input validation", () => {
    it("returns 400 when image file exceeds maximum size", async () => {
      const largeSize = 11 * 1024 * 1024
      const formData = new FormData()
      const largeFile = new File([new ArrayBuffer(largeSize)], "large.jpg", { type: "image/jpeg" })
      formData.append("timetableImage", largeFile)

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when no image file is provided", async () => {
      const request = createMockRequest("POST", { formData: new FormData() })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when file is not an image", async () => {
      const formData = new FormData()
      const textFile = new File(["text"], "doc.txt", { type: "text/plain" })
      formData.append("timetableImage", textFile)

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("Success path", () => {
    it("runs vision agent and returns extracted timetable", async () => {
      const mockResult = {
        timetableSummary: "| Day | Time | Subject |\n| MONDAY | 8h | Maths |",
        isValidTimetable: true,
        validationErrorMessage: undefined,
      }
      vi.mocked(visionAgent).mockResolvedValue(mockResult as never)

      const request = createMockRequest("POST", { formData: createImageFormData() })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        timetableSummary: mockResult.timetableSummary,
        isValidTimetable: mockResult.isValidTimetable,
        validationErrorMessage: mockResult.validationErrorMessage,
      })
    })

    it("saves vision cache after successful extraction", async () => {
      vi.mocked(visionAgent).mockResolvedValue({
        timetableSummary: "| MONDAY | 8h | Maths |",
        isValidTimetable: true,
        validationErrorMessage: undefined,
      } as never)

      const mockSaveVisionCache = vi.fn().mockResolvedValue(null)
      vi.mocked(ProfileService).mockImplementation(function () {
        return { saveVisionCache: mockSaveVisionCache }
      })

      const request = createMockRequest("POST", { formData: createImageFormData() })
      await POST(request)

      expect(mockSaveVisionCache).toHaveBeenCalledWith(userId, "| MONDAY | 8h | Maths |", true)
    })
  })

  describe("Error handling", () => {
    it("returns 500 when vision agent throws", async () => {
      vi.mocked(visionAgent).mockRejectedValue(new Error("Vision agent failure"))

      const request = createMockRequest("POST", { formData: createImageFormData() })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("handles undefined fields from vision agent with fallback defaults", async () => {
      vi.mocked(visionAgent).mockResolvedValue({
        timetableSummary: undefined,
        isValidTimetable: undefined,
        validationErrorMessage: "Error",
      } as never)

      const mockSaveVisionCache = vi.fn().mockResolvedValue(null)
      vi.mocked(ProfileService).mockImplementation(function () {
        return { saveVisionCache: mockSaveVisionCache }
      })

      const request = createMockRequest("POST", { formData: createImageFormData() })
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockSaveVisionCache).toHaveBeenCalledWith(userId, "", true)
    })
  })
})
