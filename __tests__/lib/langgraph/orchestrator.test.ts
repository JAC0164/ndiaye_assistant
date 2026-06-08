import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"

const mockGetCachedAnalysis = vi.hoisted(() => vi.fn())
const mockSaveAnalysisCache = vi.hoisted(() => vi.fn())
const mockGetCoefficientsByClassName = vi.hoisted(() => vi.fn())
const mockGetWeeklyStats = vi.hoisted(() => vi.fn())
const mockInvoke = vi.hoisted(() => vi.fn())
const mockCreatePlanningGraph = vi.hoisted(() =>
  vi.fn(() => ({ invoke: mockInvoke }))
)

vi.mock("@/src/services/profile.service", () => ({
  ProfileService: vi.fn(function () {
    return {
      getCachedAnalysis: mockGetCachedAnalysis,
      saveAnalysisCache: mockSaveAnalysisCache,
    }
  }),
}))

vi.mock("@/src/services/coefficient.service", () => ({
  CoefficientService: vi.fn(function () {
    return {
      getCoefficientsByClassName: mockGetCoefficientsByClassName,
    }
  }),
}))

vi.mock("@/src/services/historique.service", () => ({
  HistoriqueService: vi.fn(function () {
    return {
      getWeeklyStats: mockGetWeeklyStats,
    }
  }),
}))

vi.mock("@/src/lib/langgraph/graph", () => ({
  createPlanningGraph: mockCreatePlanningGraph,
}))

describe("runPlanningWorkflow", () => {
  let runPlanningWorkflow: Awaited<
    typeof import("@/src/lib/langgraph/orchestrator")
  >["runPlanningWorkflow"]
  let supabase: ReturnType<typeof createMockSupabase>["supabase"]
  const buffer = Buffer.from("test-image")
  const onboardingData = { serie: "S1", weakSubjects: ["Maths"] }

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    const module = await import("@/src/lib/langgraph/orchestrator")
    runPlanningWorkflow = module.runPlanningWorkflow

    const mockSupabase = createMockSupabase()
    supabase = mockSupabase.supabase
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns a PlanningWorkflowResult (= PlanningGraphState)", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([
      { subject: "Maths", coefficient: 5 },
      { subject: "PC", coefficient: 4 },
    ])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 3,
      totalMinutes: 135,
      averageRating: 4,
      completedBySubject: { Maths: 2, PC: 1 },
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "LUNDI:\n- 08:00: Maths",
      studentProfileContext: "- Weak in Maths",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    const result = await runPlanningWorkflow(
      supabase,
      "user-1",
      buffer,
      onboardingData,
      "image/jpeg"
    )

    expect(result).toHaveProperty("extractedTimetableMarkdown")
    expect(result).toHaveProperty("studentProfileContext")
    expect(result).toHaveProperty("isValidTimetable")
    expect(result).toHaveProperty("generatedPlanning")
    expect(result.extractedTimetableMarkdown).toBe("LUNDI:\n- 08:00: Maths")
  })

  it("fetches coefficients from CoefficientService and passes them to graph", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([
      { subject: "Maths", coefficient: 5 },
      { subject: "PC", coefficient: 4 },
    ])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockGetCoefficientsByClassName).toHaveBeenCalledWith("Terminale S1")
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectCoefficients: expect.stringContaining("Maths (coefficient 5)"),
      })
    )
  })

  it("handles L' series class name correctly", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-2", buffer, { serie: "L'" })

    expect(mockGetCoefficientsByClassName).toHaveBeenCalledWith("Terminale L'1")
  })

  it("fetches weekly stats from HistoriqueService and passes them to graph", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 5,
      totalMinutes: 225,
      averageRating: 3.5,
      completedBySubject: { Maths: 3, PC: 2 },
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockGetWeeklyStats).toHaveBeenCalledWith("user-1")
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyStats: expect.stringContaining("225"),
      })
    )
  })

  it("uses cached timetable and profile from ProfileService (skips vision and profile)", async () => {
    mockGetCachedAnalysis.mockResolvedValue({
      extractedTimetableMarkdown: "CACHED_TIMETABLE",
      isValidTimetable: true,
      studentProfileContext: "CACHED_PROFILE",
    })
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "CACHED_TIMETABLE",
      studentProfileContext: "CACHED_PROFILE",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockGetCachedAnalysis).toHaveBeenCalledWith("user-1")
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        extractedTimetableMarkdown: "CACHED_TIMETABLE",
        studentProfileContext: "CACHED_PROFILE",
      })
    )
  })

  it("saves updated analysis cache when timetable changes after invoke", async () => {
    mockGetCachedAnalysis.mockResolvedValue({
      extractedTimetableMarkdown: "OLD_TIMETABLE",
      isValidTimetable: true,
      studentProfileContext: "SAME_PROFILE",
    })
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "NEW_TIMETABLE",
      studentProfileContext: "SAME_PROFILE",
      isValidTimetable: false,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockSaveAnalysisCache).toHaveBeenCalledWith(
      "user-1",
      "NEW_TIMETABLE",
      false,
      undefined
    )
  })

  it("saves updated analysis cache when profile changes after invoke", async () => {
    mockGetCachedAnalysis.mockResolvedValue({
      extractedTimetableMarkdown: "TIMETABLE",
      isValidTimetable: true,
      studentProfileContext: "OLD_PROFILE",
    })
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "TIMETABLE",
      studentProfileContext: "NEW_PROFILE",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockSaveAnalysisCache).toHaveBeenCalledWith(
      "user-1",
      undefined,
      undefined,
      "NEW_PROFILE"
    )
  })

  it("does NOT save cache when neither timetable nor profile changed", async () => {
    mockGetCachedAnalysis.mockResolvedValue({
      extractedTimetableMarkdown: "SAME",
      isValidTimetable: true,
      studentProfileContext: "SAME",
    })
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "SAME",
      studentProfileContext: "SAME",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockSaveAnalysisCache).not.toHaveBeenCalled()
  })

  it("compiles graph once and caches for subsequent calls", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    const mockGraphInstance = { invoke: mockInvoke }
    mockCreatePlanningGraph.mockReturnValue(mockGraphInstance)

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    expect(mockCreatePlanningGraph).toHaveBeenCalledTimes(1)

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    expect(mockCreatePlanningGraph).toHaveBeenCalledTimes(1)
  })

  it("creates a new graph when modelOverrides are given, even if cached", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    const overrides = { vision: { temperature: 0.5 } }

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    expect(mockCreatePlanningGraph).toHaveBeenCalledTimes(1)

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData, "image/jpeg", overrides)
    expect(mockCreatePlanningGraph).toHaveBeenCalledTimes(2)

    expect(mockCreatePlanningGraph).toHaveBeenLastCalledWith(overrides)
  })

  it("propagates errors from graph invocation", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockRejectedValue(new Error("Graph invoke failure"))

    await expect(
      runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    ).rejects.toThrow("Graph invoke failure")
  })

  it("caches coefficients in-memory and reuses them on subsequent calls", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([
      { subject: "Anglais", coefficient: 3 },
    ])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    expect(mockGetCoefficientsByClassName).toHaveBeenCalledTimes(1)

    mockGetCoefficientsByClassName.mockClear()

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    expect(mockGetCoefficientsByClassName).not.toHaveBeenCalled()
  })

  it("handles coefficient fetch errors gracefully (does not propagate)", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockRejectedValue(new Error("DB error"))
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await expect(
      runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    ).resolves.toBeDefined()
  })

  it("skips coefficient fetching when onboardingData is null", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, null)

    expect(mockGetCoefficientsByClassName).not.toHaveBeenCalled()
  })

  it("skips coefficient fetching when onboardingData.serie is not a string", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, { serie: 123 })

    expect(mockGetCoefficientsByClassName).not.toHaveBeenCalled()
  })

  it("excludes Note moyenne line from weeklyStats when averageRating is null", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 2,
      totalMinutes: 60,
      averageRating: null,
      completedBySubject: { Maths: 1 },
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyStats: expect.not.stringContaining("Note moyenne"),
      })
    )
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyStats: expect.stringContaining("Total"),
      })
    )
  })

  it("excludes Répartition line from weeklyStats when completedBySubject is empty", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 2,
      totalMinutes: 60,
      averageRating: 4,
      completedBySubject: {},
    })
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyStats: expect.stringContaining("Note moyenne"),
      })
    )
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyStats: expect.not.stringContaining("Répartition"),
      })
    )
  })

  it("handles weekly stats fetch errors gracefully (does not propagate)", async () => {
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([])
    mockGetWeeklyStats.mockRejectedValue(new Error("Stats error"))
    mockInvoke.mockResolvedValue({
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await expect(
      runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    ).resolves.toBeDefined()
  })
})
