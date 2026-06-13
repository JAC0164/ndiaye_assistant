import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"

const mockGetByUserId = vi.hoisted(() => vi.fn())
const mockGetCachedAnalysis = vi.hoisted(() => vi.fn())
const mockSaveAnalysisCache = vi.hoisted(() => vi.fn())
const mockGetByClassId = vi.hoisted(() => vi.fn())
const mockGetCoefficientsByClassName = vi.hoisted(() => vi.fn())
const mockGetWeeklyStats = vi.hoisted(() => vi.fn())
const mockGetDaysSinceLastRevisionBySubject = vi.hoisted(() => vi.fn())
const mockGetUpcoming = vi.hoisted(() => vi.fn())
const mockInvoke = vi.hoisted(() => vi.fn())
const mockCreatePlanningGraph = vi.hoisted(() => vi.fn(() => ({ invoke: mockInvoke })))

vi.mock("@/src/services/profile.service", () => ({
  ProfileService: vi.fn(function () {
    return {
      getByUserId: mockGetByUserId,
      getCachedAnalysis: mockGetCachedAnalysis,
      saveAnalysisCache: mockSaveAnalysisCache,
    }
  }),
}))

vi.mock("@/src/services/coefficient.service", () => ({
  CoefficientService: vi.fn(function () {
    return {
      getByClassId: mockGetByClassId,
      getCoefficientsByClassName: mockGetCoefficientsByClassName,
    }
  }),
}))

vi.mock("@/src/services/historique.service", () => ({
  HistoriqueService: vi.fn(function () {
    return {
      getWeeklyStats: mockGetWeeklyStats,
      getDaysSinceLastRevisionBySubject: mockGetDaysSinceLastRevisionBySubject,
    }
  }),
}))

vi.mock("@/src/services/echeance.service", () => ({
  EcheanceService: vi.fn(function () {
    return {
      getUpcoming: mockGetUpcoming,
    }
  }),
}))

vi.mock("@/src/lib/langgraph/graph", () => ({
  createPlanningGraph: mockCreatePlanningGraph,
}))

// runPlanningWorkflow imported dynamically in beforeEach

const mockTimetable = {
  filiere: "S1",
  days: [
    {
      day: "monday" as const,
      slots: [
        { start: "08:00", end: "09:30", subject: "Maths", coefficient: 5, subject_type: "scientific" as const },
      ],
    },
  ],
}

describe("runPlanningWorkflow", () => {
  let runPlanningWorkflow: any
  let supabase: ReturnType<typeof createMockSupabase>["supabase"]
  const buffer = Buffer.from("test-image")
  const onboardingData = { weakSubjects: ["Maths"], bedtime: "22:00", blockedSlots: [] }

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const orchestratorModule = await import("@/src/lib/langgraph/orchestrator")
    runPlanningWorkflow = orchestratorModule.runPlanningWorkflow
    const mockSupabase = createMockSupabase()
    supabase = mockSupabase.supabase

    mockGetByUserId.mockImplementation(async (uid: string) => {
      if (uid === "user-2") {
        return { id: "user-2", email: "user2@test.com", display_name: "Test User 2", class_id: null, metadata: {} }
      }
      return { id: "user-1", email: "user1@test.com", display_name: "Test User 1", class_id: "class-1", metadata: {} }
    })
    mockGetByClassId.mockResolvedValue([
      { subject: "Maths", coefficient: 5 },
    ])
    mockGetCachedAnalysis.mockResolvedValue(null)
    mockGetCoefficientsByClassName.mockResolvedValue([
      { subject: "Maths", coefficient: 5 },
    ])
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 0,
      totalMinutes: 0,
      averageRating: null,
      completedBySubject: {},
    })
    mockGetDaysSinceLastRevisionBySubject.mockResolvedValue(new Map())
    mockGetUpcoming.mockResolvedValue([])
    mockInvoke.mockResolvedValue({
      extractedTimetable: mockTimetable,
      extractedTimetableMarkdown: "  LUNDI :\n  - 08:00-09:30 : Maths",
      studentProfileContext: "- Weak in Maths",
      isValidTimetable: true,
      generatedPlanning: [],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns a PlanningWorkflowResult (= PlanningGraphState)", async () => {
    const result = await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData, "image/jpeg")

    expect(result).toHaveProperty("extractedTimetable")
    expect(result).toHaveProperty("studentProfileContext")
    expect(result).toHaveProperty("isValidTimetable")
    expect(result).toHaveProperty("generatedPlanning")
    expect(result.extractedTimetable).toEqual(mockTimetable)
  })

  it("fetches coefficients from CoefficientService and passes them as formatted table to graph", async () => {
    mockGetByClassId.mockResolvedValue([
      { subject: "Maths", coefficient: 5 },
      { subject: "PC", coefficient: 4 },
    ])

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockGetByClassId).toHaveBeenCalledWith("class-1")
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        coefficientTable: expect.stringContaining("- MATHS: 5"),
      })
    )
  })

  it("falls back to Terminale S1 coefficients when class_id is null", async () => {
    await runPlanningWorkflow(supabase, "user-2", buffer, onboardingData)
    expect(mockGetCoefficientsByClassName).toHaveBeenCalledWith("Terminale S1")
  })

  it("fetches weekly stats from HistoriqueService and passes them to graph", async () => {
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 5,
      totalMinutes: 225,
      averageRating: 3.5,
      completedBySubject: { Maths: 3, PC: 2 },
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
      extractedTimetableMarkdown: JSON.stringify(mockTimetable),
      isValidTimetable: true,
      studentProfileContext: "CACHED_PROFILE",
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockGetCachedAnalysis).toHaveBeenCalledWith("user-1")
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        extractedTimetable: mockTimetable,
        studentProfileContext: "CACHED_PROFILE",
      })
    )
  })

  it("saves updated analysis cache when timetable changes after invoke", async () => {
    const oldTimetable = { ...mockTimetable, filiere: "OLD" }
    mockGetCachedAnalysis.mockResolvedValue({
      extractedTimetableMarkdown: JSON.stringify(oldTimetable),
      isValidTimetable: true,
      studentProfileContext: "SAME_PROFILE",
    })
    mockInvoke.mockResolvedValue({
      extractedTimetable: mockTimetable,
      studentProfileContext: "SAME_PROFILE",
      isValidTimetable: false,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockSaveAnalysisCache).toHaveBeenCalledWith(
      "user-1",
      JSON.stringify(mockTimetable),
      false,
      undefined
    )
  })

  it("saves updated analysis cache when profile changes after invoke", async () => {
    mockGetCachedAnalysis.mockResolvedValue({
      extractedTimetableMarkdown: JSON.stringify(mockTimetable),
      isValidTimetable: true,
      studentProfileContext: "OLD_PROFILE",
    })
    mockInvoke.mockResolvedValue({
      extractedTimetable: mockTimetable,
      studentProfileContext: "NEW_PROFILE",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockSaveAnalysisCache).toHaveBeenCalledWith("user-1", undefined, undefined, "NEW_PROFILE")
  })

  it("does NOT save cache when neither timetable nor profile changed", async () => {
    mockGetCachedAnalysis.mockResolvedValue({
      extractedTimetableMarkdown: JSON.stringify(mockTimetable),
      isValidTimetable: true,
      studentProfileContext: "SAME",
    })
    mockInvoke.mockResolvedValue({
      extractedTimetable: mockTimetable,
      studentProfileContext: "SAME",
      isValidTimetable: true,
      generatedPlanning: [],
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockSaveAnalysisCache).not.toHaveBeenCalled()
  })

  it("propagates errors from graph invocation", async () => {
    mockInvoke.mockRejectedValue(new Error("Graph invoke failure"))
    await expect(runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)).rejects.toThrow(
      "Graph invoke failure"
    )
  })

  it("caches coefficients in-memory and reuses them on subsequent calls", async () => {
    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    expect(mockGetByClassId).toHaveBeenCalledTimes(1)

    mockGetByClassId.mockClear()

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)
    expect(mockGetByClassId).not.toHaveBeenCalled()
  })

  it("handles coefficient fetch errors gracefully (does not propagate)", async () => {
    mockGetByClassId.mockRejectedValue(new Error("DB error"))
    await expect(runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)).resolves.toBeDefined()
  })

  it("excludes Note moyenne line from weeklyStats when averageRating is null", async () => {
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 2,
      totalMinutes: 60,
      averageRating: null,
      completedBySubject: { Maths: 1 },
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyStats: expect.not.stringContaining("Note moyenne"),
      })
    )
  })

  it("excludes Répartition line from weeklyStats when completedBySubject is empty", async () => {
    mockGetWeeklyStats.mockResolvedValue({
      sessionCount: 2,
      totalMinutes: 60,
      averageRating: 4,
      completedBySubject: {},
    })

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyStats: expect.not.stringContaining("Répartition"),
      })
    )
  })

  it("handles weekly stats fetch errors gracefully (does not propagate)", async () => {
    mockGetWeeklyStats.mockRejectedValue(new Error("Stats error"))
    await expect(runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)).resolves.toBeDefined()
  })

  it("fetches upcoming echeances and passes formatted string to graph", async () => {
    mockGetUpcoming.mockResolvedValue([
      { subject: "Maths", title: "Contrôle continu", echeance_type: "devoir", due_date: "2026-06-12" },
    ])

    await runPlanningWorkflow(supabase, "user-1", buffer, onboardingData)

    expect(mockGetUpcoming).toHaveBeenCalledWith("user-1", 7)
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        upcomingEcheances: expect.stringContaining("Maths"),
      })
    )
  })
})
