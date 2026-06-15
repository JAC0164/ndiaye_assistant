import { describe, it, expect, vi, beforeEach } from "vitest"
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
        subject: "MATH",
        session_type: "review",
        pedagogical_note: "35 min exos, 10 min synthèse",
      },
      {
        day_of_week: "tuesday",
        start_time: "18:00",
        end_time: "18:45",
        subject: "PC",
        session_type: "review",
        pedagogical_note: "35 min exercices, 10 min résumé",
      },
    ],
  }),
  pipe: vi.fn().mockReturnThis(),
}))

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
  createTokenLogger: vi.fn(() => ({ callbacks: [] })),
}))

vi.mock("@/src/lib/langgraph/nodes/withRetry", () => ({
  withRetry: vi.fn(async <T>(fn: () => Promise<T>, _agentName: string): Promise<T> => fn()),
}))

import { plannerAgent } from "@/src/lib/langgraph/nodes/plannerAgent"

const baseState: PlanningGraphAnnotationState = {
  timetableImage: Buffer.from("img"),
  timetableImageMimeType: "image/jpeg",
  onboardingData: { weakSubjects: [], bedtime: "22:00", blockedSlots: [] },
  timetableSummary: "LUNDI:\n- 08:00-09:30: Maths\n- 09:40-11:10: PC",
  studentProfileContext: "- Weak in Maths",
  weeklyStats: "Total: 120 min (2 sessions)",
  isValidTimetable: true,
  upcomingEcheances: "",
  generatedPlanning: [],
  extractedTimetable: null,
  coefficientTable: "",
  preplannerConstraints: "ALLOWLIST & BUDGETS:\n1. Maths",
  planningValidation: null,
}

describe("plannerAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(result.generatedPlanning[0].subject).toBe("MATH")
    expect(result.generatedPlanning[1].subject).toBe("PC")
  })

  it("skips model call and returns empty planning when isValidTimetable is false", async () => {
    const state: PlanningGraphAnnotationState = { ...baseState, isValidTimetable: false }
    const result = await plannerAgent(state)
    expect(mockModel.invoke).not.toHaveBeenCalled()
    expect(result.generatedPlanning).toEqual([])
  })

  it("includes all context fields in model input", async () => {
    await plannerAgent(baseState)
    const callArg = mockModel.invoke.mock.calls[0][0] as Record<string, string>
    expect(callArg.timetableSummary).toBe(baseState.timetableSummary)
    expect(callArg.studentProfileContext).toBe(baseState.studentProfileContext)
    expect(callArg.preplannerConstraints).toBe(baseState.preplannerConstraints)
  })

  it("uses default fallback when preplannerConstraints is empty", async () => {
    const state: PlanningGraphAnnotationState = {
      ...baseState,
      preplannerConstraints: "",
    }
    await plannerAgent(state)
    const callArg = mockModel.invoke.mock.calls[0][0] as Record<string, string>
    expect(callArg.preplannerConstraints).toBe("No constraints specified.")
  })

  it("includes scheduling rules in system prompt", async () => {
    await plannerAgent(baseState)
    const messages = mockFromMessages.mock.calls[0][0] as Array<[string, string]>
    const systemMessage = messages.find(([role]) => role === "system")?.[1] ?? ""
    expect(systemMessage).toContain("mentor")
    expect(systemMessage).toContain("allowlist")
    expect(systemMessage).toContain("same-day consolidation")
    expect(systemMessage).toContain("COGNITIVE RULE (Interleaving)")
    expect(systemMessage).toContain("WEEKEND RULE (Eat the Frog)")
    expect(systemMessage).toContain("Active Recall")
  })
})
