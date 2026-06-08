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

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => shared.supabase),
}))

vi.mock("@/src/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => true),
}))

vi.mock("@/src/lib/langgraph/orchestrator", () => ({
  runPlanningWorkflow: vi.fn(),
}))

import { POST } from "@/app/api/planning/generate/route"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { runPlanningWorkflow } from "@/src/lib/langgraph/orchestrator"

const validWorkflowResult = {
  isValidTimetable: true,
  extractedTimetableMarkdown: "| Jour | Heure | Matière |\n| Lundi | 8h | Maths |",
  studentProfileContext: "Élève de Terminale S",
  generatedPlanning: [{ day: "Lundi", sessions: [{ subject: "Maths", time: "8h" }] }],
  validationErrorMessage: undefined,
}

function createFormDataWithImage(image?: Partial<File>): FormData {
  const file = new File(
    [image?.size ? new ArrayBuffer(image.size) : new ArrayBuffer(1024)],
    image?.name ?? "timetable.jpg",
    { type: image?.type ?? "image/jpeg" }
  )
  const fd = new FormData()
  fd.append("timetableImage", file)
  fd.append("onboardingData", JSON.stringify({ class_name: "Terminale S" }))
  return fd
}

describe("POST /api/planning/generate", () => {
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
        formData: createFormDataWithImage(),
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 401 when auth error occurs with bearer token", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("Invalid token"),
      })

      const request = createMockRequest("POST", {
        headers: { authorization: "Bearer invalid-token" },
        formData: createFormDataWithImage(),
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("Input validation", () => {
    it("returns 400 when timetableImage is missing", async () => {
      const formData = new FormData()
      formData.append("onboardingData", JSON.stringify({}))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when timetableImage is not an image file", async () => {
      const formData = new FormData()
      const textFile = new File(["not-an-image"], "doc.pdf", { type: "application/pdf" })
      formData.append("timetableImage", textFile)

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })

    it("returns 400 when image exceeds 10MB", async () => {
      const formData = new FormData()
      const largeFile = new File(
        [new ArrayBuffer(11 * 1024 * 1024)],
        "large.jpg",
        { type: "image/jpeg" }
      )
      formData.append("timetableImage", largeFile)

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("Model Overrides validation", () => {
    it("accepts valid modelOverrides", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      formData.set("modelOverrides", JSON.stringify({
        vision: { temperature: 0.5 },
        planner: { provider: "openai", model: "gpt-4" },
      }))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it("rejects modelOverrides with temperature > 2", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      formData.set("modelOverrides", JSON.stringify({ vision: { temperature: 3 } }))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it("rejects modelOverrides with invalid provider", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      formData.set("modelOverrides", JSON.stringify({ planner: { provider: "unknown-ai" } }))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it("rejects modelOverrides with invalid baseUrl", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      formData.set("modelOverrides", JSON.stringify({ vision: { baseUrl: "not-a-url" } }))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it("accepts modelOverrides with valid URL baseUrl", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      formData.set("modelOverrides", JSON.stringify({
        vision: { baseUrl: "https://custom.api.com/v1" },
      }))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it("accepts modelOverrides with empty string baseUrl", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      formData.set("modelOverrides", JSON.stringify({ vision: { baseUrl: "" } }))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it("handles invalid JSON in modelOverrides via parseJSONField catch", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      formData.set("modelOverrides", "not-valid-json")

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })
  })

  describe("Success path", () => {
    it("returns planning result for valid timetable", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      formData.set("onboardingData", JSON.stringify({ class_name: "Terminale S", series_name: "S" }))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.isValidTimetable).toBe(true)
      expect(data).toHaveProperty("extractedTimetableMarkdown")
      expect(data).toHaveProperty("studentProfileContext")
      expect(data).toHaveProperty("generatedPlanning")
    })
  })

  describe("Invalid timetable handling", () => {
    it("returns 422 when timetable is invalid", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue({
        isValidTimetable: false,
        validationErrorMessage: "Emploi du temps incomplet",
        generatedPlanning: [],
        extractedTimetableMarkdown: "",
        studentProfileContext: "",
      })

      const formData = createFormDataWithImage()
      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(422)
      const data = await response.json()
      expect(data.isValidTimetable).toBe(false)
      expect(data).toHaveProperty("validationErrorMessage")
      expect(data).toHaveProperty("generatedPlanning")
    })
  })

  describe("Timeout handling", () => {
    it("handles 60s timeout", async () => {
      vi.mocked(runPlanningWorkflow).mockRejectedValue(
        new Error("La requête a expiré après 60s. Veuillez réessayer.")
      )

      const formData = createFormDataWithImage()
      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })

  describe("onboardingData fallback", () => {
    it("uses empty object when onboardingData is not provided in form", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = new FormData()
      const file = new File([new ArrayBuffer(1024)], "timetable.jpg", { type: "image/jpeg" })
      formData.append("timetableImage", file)

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })
  })

  describe("Timeout", () => {
    it("triggers timeout callback when workflow exceeds time limit", async () => {
      vi.useFakeTimers()
      try {
        vi.mocked(runPlanningWorkflow).mockReturnValue(new Promise(() => {}))

        const formData = createFormDataWithImage()
        const request = createMockRequest("POST", { formData })
        const responsePromise = POST(request)

        await vi.advanceTimersByTimeAsync(60000)

        const response = await responsePromise
        expect(response.status).toBe(500)
        const data = await response.json()
        expect(data.error).toContain("Erreur lors de la génération")
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("Edge cases", () => {
    it("handles missing onboardingData (parseJSONField returns undefined, ?? {} fallback)", async () => {
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = new FormData()
      formData.append("timetableImage", new File(
        [new ArrayBuffer(1024)],
        "timetable.jpg",
        { type: "image/jpeg" }
      ))

      const request = createMockRequest("POST", { formData })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it("supports bearer token auth success path with custom supabase client", async () => {
      shared.supabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "bearer-user" } },
        error: null,
      })
      vi.mocked(runPlanningWorkflow).mockResolvedValue(validWorkflowResult)

      const formData = createFormDataWithImage()
      const request = createMockRequest("POST", {
        headers: { authorization: "Bearer valid-token" },
        formData,
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it("handles non-Error throw from formData (returns generic bad request)", async () => {
      const request = createMockRequest("POST", { formData: new FormData() })
      request.formData = vi.fn().mockRejectedValue("string error")

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe("Requête invalide.")
    })
  })

  describe("Rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      vi.mocked(checkRateLimit).mockReturnValue(false)

      const request = createMockRequest("POST", { formData: new FormData() })
      const response = await POST(request)

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data).toHaveProperty("error")
    })
  })
})
