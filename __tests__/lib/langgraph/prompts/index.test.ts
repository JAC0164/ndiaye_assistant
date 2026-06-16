import { describe, it, expect } from "vitest"
import {
  buildPlannerSystemPrompt,
  PLANNER_HUMAN_TEMPLATE,
  buildVisionSystemPrompt,
  VISION_HUMAN_CONTENT,
} from "@/src/lib/langgraph/prompts"

describe("prompts index", () => {
  it("exports all prompt helpers and constants correctly", () => {
    expect(buildPlannerSystemPrompt).toBeDefined()
    expect(typeof buildPlannerSystemPrompt).toBe("function")
    expect(PLANNER_HUMAN_TEMPLATE).toContain("Profil de l'élève")

    expect(buildVisionSystemPrompt).toBeDefined()
    expect(typeof buildVisionSystemPrompt).toBe("function")
    expect(VISION_HUMAN_CONTENT[0].text).toContain("Analyze this image")
  })
})
