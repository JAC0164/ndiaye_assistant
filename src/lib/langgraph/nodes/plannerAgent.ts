import { ChatPromptTemplate } from "@langchain/core/prompts"
import { getModel, createTokenLogger } from "../model"
import { logger } from "@/src/lib/logger"
import { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate, plannerAgentOutputSchema } from "../state"
import type { ModelProviderConfig } from "../providers"
import { withRetry } from "./withRetry"
import { PLANNING_CONFIG } from "../../planning/planningConfig"

export async function plannerAgent(
  state: PlanningGraphAnnotationState,
  modelOverrides?: Partial<ModelProviderConfig>
): Promise<PlanningGraphAnnotationUpdate> {
  if (!state.isValidTimetable) {
    return {
      generatedPlanning: [],
    }
  }

  if (process.env.STOP_AT_AGENT === "vision" || process.env.STOP_AT_AGENT === "profile") {
    logger.info({ stopAtAgent: process.env.STOP_AT_AGENT }, "[Stop] PLANNER")
    return {
      generatedPlanning: [],
    }
  }

  const model = getModel("planner", modelOverrides)
  const structuredModel = model.withStructuredOutput(plannerAgentOutputSchema, {
    name: "generate_weekly_study_sessions",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Role: Planner Agent. Build a weekly revision schedule for a Senegalese student by placing",
        "subjects into the available time slots provided below.",
        "",
        "YOU MUST RESPECT THESE HARD CONSTRAINTS:",
        `- ONLY use the free slots listed below. Do NOT schedule outside these windows.`,
        `- ONLY schedule subjects from the allowlist below. Do NOT invent or add any subject.`,
        `- Respect the per-subject time budget (±15 min tolerance). Prioritize high-priority subjects.`,
        `- Each session must be between ${PLANNING_CONFIG.minSessionMinutes} and ${PLANNING_CONFIG.maxSessionMinutes} minutes.`,
        `- Insert a ${PLANNING_CONFIG.betweenSessionBreakMinutes}-min break between consecutive study sessions.`,
        `- For breaks, set session_type to "break" and subject to "Pause".`,
        "",
        "PEDAGOGICAL GUIDELINES (use these to decide placement, not hard rules):",
        "- Same-day consolidation: prefer scheduling a review session for a subject taught earlier that day.",
        "- J-1 preparation: schedule review for subjects the student has class for the next school day.",
        "- Cognitive alternation: avoid consecutive sessions of the same cognitive type (scientific then literary, not scientific then scientific).",
        "- Spacing: spread sessions for the same subject across different days when possible.",
        "- Weekend: use Saturday/Sunday for cumulative review of high-coefficient and weak subjects.",
        "",
        "SESSION TYPE MAPPING:",
        "- review: consolidation, rereading notes, memorization, concept synthesis",
        "- td: exercises, problem-solving, application",
        "- break: rest/decompression (subject MUST be \"Pause\" or \"Détente\")",
        "",
        "PEDAGOGICAL NOTES:",
        "- Write pedagogical_note in French, addressed to the student (tu).",
        "- Specify what to do during the session (e.g. \"Relis le chapitre sur les fonctions, refais exercices 4 et 7\").",
        "- 1–2 sentences maximum.",
        "- Appropriate for the session_type.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "Student profile:",
        "{studentProfileContext}",
        "",
        "School timetable (subjects per day):",
        "{timetableSummary}",
        "",
        "Subject allowlist with budgets, priorities, and available free slots:",
        "{preplannerConstraints}",
        "",
        "Generate the complete weekly revision schedule.",
      ].join("\n"),
    ],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await withRetry(
    () =>
      chain.invoke(
        {
          studentProfileContext: state.studentProfileContext,
          timetableSummary: state.extractedTimetableMarkdown,
          preplannerConstraints: state.preplannerConstraints || "No constraints specified.",
        },
        createTokenLogger("planner")
      ),
    "planner"
  )

  return {
    generatedPlanning: result.sessions,
  }
}
