import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@langchain/langgraph", () => {
  function createGraphInstance() {
    const instance: Record<string, any> = {}
    instance._nodeNames = [] as string[]
    instance._edgeFromTo = [] as Array<{ from: string | string[]; to: string }>
    instance._condEdges = [] as Array<{
      from: string
      condition: (...args: unknown[]) => unknown
      mappings: Record<string, string>
    }>

    instance.addNode = vi.fn(function (this: any, name: string, _fn: (...args: unknown[]) => unknown) {
      this._nodeNames.push(name)
      if (!this._nodeFns) this._nodeFns = {}
      this._nodeFns[name] = _fn
      return this
    })

    instance.addEdge = vi.fn(function (this: any, from: string | string[], to: string) {
      this._edgeFromTo.push({ from, to })
      return this
    })

    instance.addConditionalEdges = vi.fn(function (
      this: any,
      from: string,
      condition: (...args: unknown[]) => unknown,
      mappings: Record<string, string>
    ) {
      this._condEdges.push({ from, condition, mappings })
      return this
    })

    instance.compile = vi.fn(function (this: any) {
      return {
        nodeNames: [...this._nodeNames],
        edgeFromTo: [...this._edgeFromTo],
        condEdges: this._condEdges.map((e: any) => ({
          ...e,
          condition: e.condition,
        })),
        invoke: vi.fn(),
      }
    })

    return instance
  }

  const Annotation = vi.fn(() => ({}))
  Annotation.Root = vi.fn(() => ({}))

  return {
    StateGraph: vi.fn(function () {
      return createGraphInstance()
    }),
    END: "__end__",
    START: "__start__",
    Annotation,
  }
})

vi.mock("@/src/lib/langgraph/nodes/visionAgent", () => ({
  visionAgent: vi.fn(),
}))

vi.mock("@/src/lib/langgraph/nodes/profileAgent", () => ({
  profileAgent: vi.fn(),
}))

vi.mock("@/src/lib/langgraph/nodes/plannerAgent", () => ({
  plannerAgent: vi.fn(),
}))

const mockComputePriority = vi.hoisted(() => vi.fn())

vi.mock("@/src/lib/planning/computePriority", () => ({
  computePriority: mockComputePriority,
}))

import { createPlanningGraph, prePlannerNode } from "@/src/lib/langgraph/graph"
import { StateGraph } from "@langchain/langgraph"
import { visionAgent } from "@/src/lib/langgraph/nodes/visionAgent"
import { profileAgent } from "@/src/lib/langgraph/nodes/profileAgent"
import { plannerAgent } from "@/src/lib/langgraph/nodes/plannerAgent"

describe("createPlanningGraph", () => {
  let compiledGraph: ReturnType<typeof createPlanningGraph>

  beforeEach(() => {
    vi.clearAllMocks()
    compiledGraph = createPlanningGraph()
  })

  it("returns a compiled graph with an invoke method", () => {
    expect(compiledGraph).toBeDefined()
    expect(compiledGraph).toHaveProperty("invoke")
    expect(typeof compiledGraph.invoke).toBe("function")
  })

  it("has exactly 5 nodes: vision, profile, visionValidated, prePlanner, planner", () => {
    expect(compiledGraph.nodeNames).toContain("vision")
    expect(compiledGraph.nodeNames).toContain("profile")
    expect(compiledGraph.nodeNames).toContain("visionValidated")
    expect(compiledGraph.nodeNames).toContain("prePlanner")
    expect(compiledGraph.nodeNames).toContain("planner")
    expect(compiledGraph.nodeNames).toHaveLength(5)
  })

  it("connects START to both vision and profile (parallel execution)", () => {
    const startEdges = compiledGraph.edgeFromTo.filter(
      (e: { from: string | string[]; to: string }) => e.from === "__start__"
    )
    const destinations = startEdges.map((e: { from: string | string[]; to: string }) => e.to)
    expect(destinations).toContain("vision")
    expect(destinations).toContain("profile")
  })

  it("has conditional edges from vision routing to visionValidated or END", () => {
    expect(compiledGraph.condEdges).toHaveLength(1)
    const visionEdge = compiledGraph.condEdges[0]
    expect(visionEdge.from).toBe("vision")
    expect(visionEdge.mappings).toEqual({
      valid: "visionValidated",
      invalid: "__end__",
      stop: "__end__",
    })
  })

  it("routes to visionValidated when isValidTimetable is true", () => {
    const conditionFn = compiledGraph.condEdges[0].condition
    const result = conditionFn({ isValidTimetable: true })
    expect(result).toBe("valid")
  })

  it("routes to END (invalid) when isValidTimetable is false", () => {
    const conditionFn = compiledGraph.condEdges[0].condition
    const result = conditionFn({ isValidTimetable: false })
    expect(result).toBe("invalid")
  })

  it("routes to stop when STOP_AT_AGENT=vision", () => {
    vi.stubEnv("STOP_AT_AGENT", "vision")
    const conditionFn = compiledGraph.condEdges[0].condition
    const result = conditionFn({ isValidTimetable: true })
    expect(result).toBe("stop")
    vi.unstubAllEnvs()
  })

  it("has edge from [visionValidated, profile] to prePlanner", () => {
    const mergeEdge = compiledGraph.edgeFromTo.find(
      (e: { from: string | string[]; to: string }) =>
        Array.isArray(e.from) &&
        e.from.includes("visionValidated") &&
        e.from.includes("profile") &&
        e.to === "prePlanner"
    )
    expect(mergeEdge).toBeDefined()
  })

  it("has edge from prePlanner to planner", () => {
    const prePlannerEdge = compiledGraph.edgeFromTo.find(
      (e: { from: string | string[]; to: string }) => e.from === "prePlanner" && e.to === "planner"
    )
    expect(prePlannerEdge).toBeDefined()
  })

  it("has edge from planner to END", () => {
    const plannerEndEdge = compiledGraph.edgeFromTo.find(
      (e: { from: string | string[]; to: string }) => e.from === "planner" && e.to === "__end__"
    )
    expect(plannerEndEdge).toBeDefined()
  })

  it("calls compile on the StateGraph", () => {
    const instance = vi.mocked(StateGraph).mock.results[0].value
    expect(instance.compile).toHaveBeenCalledTimes(1)
  })

  it("accepts modelOverrides and passes them to node functions", () => {
    const visionOverride = { temperature: 0.5 }
    const profileOverride = { model: "gpt-4" }
    const plannerOverride = { provider: "anthropic" as const }

    const overrides = {
      vision: visionOverride,
      profile: profileOverride,
      planner: plannerOverride,
    }

    vi.mocked(StateGraph).mockClear()

    createPlanningGraph(overrides)

    const instance = vi.mocked(StateGraph).mock.results[0].value
    expect(instance.addNode).toHaveBeenCalledWith("vision", expect.any(Function))
    expect(instance.addNode).toHaveBeenCalledWith("profile", expect.any(Function))
    expect(instance.addNode).toHaveBeenCalledWith("planner", expect.any(Function))
  })

  it("lambda wrapper for vision passes modelOverrides.vision to visionAgent", () => {
    vi.mocked(StateGraph).mockClear()
    vi.clearAllMocks()

    const overrides = { vision: { temperature: 0.3 } }
    createPlanningGraph(overrides)

    const instance = vi.mocked(StateGraph).mock.results[0].value
    const visionFn = instance._nodeFns["vision"]
    const state = { isValidTimetable: true }

    visionFn(state)

    expect(visionAgent).toHaveBeenCalledWith(state, overrides.vision)
  })

  it("lambda wrapper for profile passes modelOverrides.profile to profileAgent", () => {
    vi.mocked(StateGraph).mockClear()
    vi.clearAllMocks()

    const overrides = { profile: { model: "gpt-4" } }
    createPlanningGraph(overrides)

    const instance = vi.mocked(StateGraph).mock.results[0].value
    const profileFn = instance._nodeFns["profile"]
    const state = { studentProfileContext: "test" }

    profileFn(state)

    expect(profileAgent).toHaveBeenCalledWith(state, overrides.profile)
  })

  it("lambda wrapper for planner passes modelOverrides.planner to plannerAgent", () => {
    vi.mocked(StateGraph).mockClear()
    vi.clearAllMocks()

    const overrides = { planner: { provider: "anthropic" } }
    createPlanningGraph(overrides)

    const instance = vi.mocked(StateGraph).mock.results[0].value
    const plannerFn = instance._nodeFns["planner"]
    const state = { isValidTimetable: true }

    plannerFn(state)

    expect(plannerAgent).toHaveBeenCalledWith(state, overrides.planner)
  })

  it("lambda wrappers call agents with undefined when no overrides provided", () => {
    vi.mocked(StateGraph).mockClear()
    vi.clearAllMocks()

    createPlanningGraph()

    const instance = vi.mocked(StateGraph).mock.results[0].value
    const state = { isValidTimetable: true }

    instance._nodeFns["vision"](state)
    instance._nodeFns["profile"](state)
    instance._nodeFns["planner"](state)

    expect(visionAgent).toHaveBeenCalledWith(state, undefined)
    expect(profileAgent).toHaveBeenCalledWith(state, undefined)
    expect(plannerAgent).toHaveBeenCalledWith(state, undefined)
  })

  it("passValidatedVision returns empty object", () => {
    vi.mocked(StateGraph).mockClear()

    createPlanningGraph()

    const instance = vi.mocked(StateGraph).mock.results[0].value
    const validatedFn = instance._nodeFns["visionValidated"]

    const result = validatedFn()
    expect(result).toEqual({})
  })

  it("routeAfterVision returns stop when STOP_AT_AGENT=vision", () => {
    vi.mocked(StateGraph).mockClear()

    createPlanningGraph()

    const instance = vi.mocked(StateGraph).mock.results[0].value
    const snapshot = instance.compile()
    const conditionFn = snapshot.condEdges[0].condition

    vi.stubEnv("STOP_AT_AGENT", "vision")
    const result = conditionFn({ isValidTimetable: true })
    expect(result).toBe("stop")
    vi.unstubAllEnvs()
  })

  describe("prePlannerNode", () => {
    beforeEach(() => {
      mockComputePriority.mockImplementation((subjects: { name: string; coefficient: number | null }[]) => {
        const map = new Map<string, number>()
        for (const s of subjects) {
          map.set(s.name, s.coefficient ?? 1)
        }
        return map
      })
    })

    it("should compute constraints and return formatted preplannerConstraints string", () => {
      // prePlannerNode is imported at the top
      const state = {
        extractedTimetable: {
          filiere: "S1",
          days: [
            {
              day: "monday" as const,
              slots: [
                { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              ],
            },
          ],
        },
        onboardingData: {
          bedtime: "22:00",
          blockedSlots: [],
          academicPeriod: "milieu_trimestre",
          daysSinceLastRevision: [["MATH", 3]],
          weakSubjects: ["MATH"],
        },
      }

      const result = prePlannerNode(state)
      expect(result).toHaveProperty("preplannerConstraints")
      expect(result.preplannerConstraints).toContain("ALLOWLIST & BUDGETS")
      expect(result.preplannerConstraints).toContain("MATH")
      expect(result.preplannerConstraints).toContain("FREE SLOTS")
    })

    it("should return 'No timetable available.' when extractedTimetable is null", () => {
      const state = {
        extractedTimetable: null,
        onboardingData: {},
      }
      const result = prePlannerNode(state)
      expect(result).toEqual({ preplannerConstraints: "No timetable available." })
    })

    it("should update slot coefficient when subject is found in coefficient map", () => {
      const state = {
        coefficientTable: "- MATH: 6",
        extractedTimetable: {
          filiere: "S1",
          days: [
            {
              day: "monday" as const,
              slots: [
                { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              ],
            },
          ],
        },
        onboardingData: {},
      }
      const result = prePlannerNode(state)
      expect(result.preplannerConstraints).toContain("MATH")
      expect(state.extractedTimetable.days[0].slots[0].coefficient).toBe(6)
    })

    it("should handle subject with zero budget", () => {
      const state = {
        coefficientTable: "- MATH: 0",
        extractedTimetable: {
          filiere: "S1",
          days: [
            {
              day: "monday" as const,
              slots: [
                { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              ],
            },
          ],
        },
        onboardingData: {},
      }
      const result = prePlannerNode(state)
      expect(result.preplannerConstraints).toContain("budget: 0 min")
    })

    it("should handle no free slots available", () => {
      const state = {
        extractedTimetable: {
          filiere: "S1",
          days: [
            {
              day: "monday" as const,
              slots: [
                { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              ],
            },
          ],
        },
        onboardingData: {
          bedtime: "00:00",
          blockedSlots: [],
        },
      }
      const result = prePlannerNode(state)
      expect(result.preplannerConstraints).toContain("(No free slots available.")
    })

    it("should handle null days in timetable (line 45 false branch)", () => {
      const state = {
        coefficientTable: "- MATH: 6",
        extractedTimetable: {
          filiere: "S1",
          days: null,
        },
        onboardingData: {},
      }
      const result = prePlannerNode(state as any)
      expect(result.preplannerConstraints).toContain("ALLOWLIST & BUDGETS")
    })

    it("should handle day with null slots (line 47 false branch)", () => {
      const state = {
        extractedTimetable: {
          filiere: "S1",
          days: [{ day: "monday", slots: null } as any],
        },
        onboardingData: {},
      }
      const result = prePlannerNode(state)
      expect(result.preplannerConstraints).toContain("ALLOWLIST & BUDGETS")
    })

    it("should handle null onboardingData (line 59 fallback)", () => {
      const state = {
        coefficientTable: "- MATH: 6",
        extractedTimetable: {
          filiere: "S1",
          days: [
            {
              day: "monday",
              slots: [
                { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              ],
            },
          ],
        },
        onboardingData: null,
      }
      const result = prePlannerNode(state as any)
      expect(result.preplannerConstraints).toContain("ALLOWLIST & BUDGETS")
      expect(result.preplannerConstraints).toContain("FREE SLOTS")
    })

    it("should fall back to ?? 0 when priority not found for a subject (line 92)", () => {
      mockComputePriority.mockReturnValueOnce(new Map())
      const state = {
        coefficientTable: "- MATH: 6",
        extractedTimetable: {
          filiere: "S1",
          days: [
            {
              day: "monday",
              slots: [
                { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              ],
            },
          ],
        },
        onboardingData: {},
      }
      const result = prePlannerNode(state)
      expect(result.preplannerConstraints).toContain("priority: 0")
    })
  })
})
