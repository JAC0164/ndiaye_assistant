import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { plannerAgentOutputSchema } from "@/src/lib/langgraph/state"
import type { PlanningGraphAnnotationState } from "@/src/lib/langgraph/state"

const mockModel = vi.hoisted(() => ({
  withStructuredOutput: vi.fn().mockReturnThis(),
  invoke: vi.fn().mockResolvedValue({
    sessions: [
      {
        day_of_week: "monday",
        start_time: "18:00",
        end_time: "18:45",
        subject: "Mathématiques",
        session_type: "review",
        pedagogical_note: "35 min exos, 10 min synthèse",
      },
      {
        day_of_week: "tuesday",
        start_time: "18:00",
        end_time: "18:45",
        subject: "Physique-Chimie",
        session_type: "review",
        pedagogical_note: "35 min exercices, 10 min résumé",
      },
    ],
  }),
  pipe: vi.fn().mockReturnThis(),
}))

const mockCreateTokenLogger = vi.hoisted(() =>
  vi.fn(() => ({ callbacks: [] }))
)

const mockFromMessages = vi.hoisted(() =>
  vi.fn(() => ({
    pipe: vi.fn(() => mockModel),
  }))
)

vi.mock("@langchain/core/prompts", () => ({
  ChatPromptTemplate: {
    fromMessages: mockFromMessages,
  },
}))

vi.mock("@/src/lib/langgraph/model", () => ({
  getModel: vi.fn(() => mockModel),
  createTokenLogger: mockCreateTokenLogger,
}))

vi.mock("@/src/lib/langgraph/nodes/withRetry", () => ({
  withRetry: vi.fn(
    async <T>(fn: () => Promise<T>, _agentName: string): Promise<T> => fn()
  ),
}))

import { plannerAgent } from "@/src/lib/langgraph/nodes/plannerAgent"

const baseState: PlanningGraphAnnotationState = {
  timetableImage: Buffer.from("img"),
  timetableImageMimeType: "image/jpeg",
  onboardingData: { serie: "S1" },
  extractedTimetableMarkdown: "LUNDI:\n- 08:00-09:30: Maths\n- 09:40-11:10: PC",
  studentProfileContext: "- Weak in Maths",
  subjectCoefficients: "Maths (coeff 5), PC (coeff 4)",
  weeklyStats: "Total: 120 min (2 sessions)",
  isValidTimetable: true,
  generatedPlanning: [],
}

describe("plannerAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.STOP_AT_AGENT
  })

  it("calls model.withStructuredOutput with plannerAgentOutputSchema", async () => {
    await plannerAgent(baseState)
    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
      plannerAgentOutputSchema,
      expect.objectContaining({ name: "generate_weekly_study_sessions" })
    )
  })

  it("returns generatedPlanning from model output", async () => {
    const result = await plannerAgent(baseState)
    expect(result).toHaveProperty("generatedPlanning")
    expect(result.generatedPlanning).toHaveLength(2)
    expect(result.generatedPlanning[0].subject).toBe("Mathématiques")
    expect(result.generatedPlanning[1].subject).toBe("Physique-Chimie")
  })

  it("skips model call and returns empty planning when isValidTimetable is false", async () => {
    const state: PlanningGraphAnnotationState = { ...baseState, isValidTimetable: false }
    const result = await plannerAgent(state)
    expect(mockModel.invoke).not.toHaveBeenCalled()
    expect(result.generatedPlanning).toEqual([])
  })

  it("skips model call and returns empty planning when STOP_AT_AGENT=vision", async () => {
    process.env.STOP_AT_AGENT = "vision"
    const result = await plannerAgent(baseState)
    expect(mockModel.invoke).not.toHaveBeenCalled()
    expect(result.generatedPlanning).toEqual([])
  })

  it("skips model call and returns empty planning when STOP_AT_AGENT=profile", async () => {
    process.env.STOP_AT_AGENT = "profile"
    const result = await plannerAgent(baseState)
    expect(mockModel.invoke).not.toHaveBeenCalled()
    expect(result.generatedPlanning).toEqual([])
  })

  it("runs normally when STOP_AT_AGENT=planner", async () => {
    process.env.STOP_AT_AGENT = "planner"
    const result = await plannerAgent(baseState)
    expect(mockModel.invoke).toHaveBeenCalled()
    expect(result.generatedPlanning).toHaveLength(2)
  })

  it("includes timetable, profile, coefficients, and weekly stats in model input", async () => {
    await plannerAgent(baseState)
    const callArg = mockModel.invoke.mock.calls[0][0] as Record<string, string>
    expect(callArg.extractedTimetableMarkdown).toBe(baseState.extractedTimetableMarkdown)
    expect(callArg.studentProfileContext).toBe(baseState.studentProfileContext)
    expect(callArg.subjectCoefficients).toBe(baseState.subjectCoefficients)
    expect(callArg.weeklyStats).toBe(baseState.weeklyStats)
  })

  it("uses default fallbacks when coefficients and weekly stats are empty", async () => {
    const state: PlanningGraphAnnotationState = {
      ...baseState,
      subjectCoefficients: "",
      weeklyStats: "",
    }
    await plannerAgent(state)
    const callArg = mockModel.invoke.mock.calls[0][0] as Record<string, string>
    expect(callArg.subjectCoefficients).toBe("Aucun coefficient spécifique disponible.")
    expect(callArg.weeklyStats).toBe("Aucune session complétée cette semaine.")
  })

  it("passes modelOverrides to getModel", async () => {
    const modelModule = await import("@/src/lib/langgraph/model")
    const getModelSpy = vi.spyOn(modelModule, "getModel")

    const overrides = { temperature: 0.3 }
    await plannerAgent(baseState, overrides)
    expect(getModelSpy).toHaveBeenCalledWith("planner", overrides)

    getModelSpy.mockRestore()
  })

  it("creates token logger for 'planner' agent", async () => {
    await plannerAgent(baseState)
    expect(mockCreateTokenLogger).toHaveBeenCalledWith("planner")
  })

  it("includes Senegalese scheduling rules in system prompt", async () => {
    await plannerAgent(baseState)
    const messages = mockFromMessages.mock.calls[0][0] as Array<[string, string]>
    const systemMessage = messages.find(([role]) => role === "system")?.[1] ?? ""
    expect(systemMessage).toContain("Planner Agent")
    expect(systemMessage).toContain("45-minute")
    expect(systemMessage).toContain("Sunday Rest")
    expect(systemMessage).toContain("J-1 Revision")
    expect(systemMessage).toContain("Cognitive Alternation")
  })
})
