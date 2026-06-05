import { ChatPromptTemplate } from "@langchain/core/prompts"

import { getModel, createTokenLogger } from "../model"
import {
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
  plannerAgentOutputSchema,
} from "../state"
import type { ModelProviderConfig } from "../providers"

export async function plannerAgent(
  state: PlanningGraphAnnotationState,
  modelOverrides?: Partial<ModelProviderConfig>
): Promise<PlanningGraphAnnotationUpdate> {
  if (!state.isValidTimetable) {
    return {
      generatedPlanning: [],
    }
  }

  if (
    process.env.STOP_AT_AGENT === "vision" ||
    process.env.STOP_AT_AGENT === "profile"
  ) {
    console.log(
      `\x1b[33m[Stop] PLANNER  | Halted because STOP_AT_AGENT="${process.env.STOP_AT_AGENT}".\x1b[0m`
    )
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
        "Role: Planner Agent. Build a cyclic 7-day weekly study schedule (45-minute study sessions).",
        "",
        "SUBJECT CLASSIFICATION (Use for alternation and track priority):",
        "- Sciences (Calculations & Logic): Mathématiques, Physique-Chimie, SVT (Life and Earth Sciences).",
        "- Humanities (Memorization & Writing): Philosophie, Histoire-Géographie, Français.",
        "- Languages & Communication: Anglais, Espagnol, Allemand, Arabe.",
        "",
        "STRICT RULES:",
        "- DO NOT schedule during class hours extracted from the school timetable.",
        "- DO NOT schedule during unavailable slots (blockedSlots) or after bedtime (bedtime) defined in the student profile.",
        "- Session Type: All sessions must be personal study sessions with session_type = 'review'.",
        "- Time Format: Use HH:mm format for start_time and end_time.",
        "- Days Format: Use lowercase English days (monday, tuesday, wednesday, thursday, friday, saturday, sunday).",
        "",
        "REST & HEALTH RULES:",
        "1. Decompression Gap: Always leave at least 45 minutes of free/rest time after the last school class of the day and after any blocked activity (blockedSlots) before starting a study session.",
        "2. Sunday Rest: Sunday must be dedicated to rest. Do not schedule study sessions on Sunday morning or afternoon. Max 1 review session on Sunday evening to prepare for Monday.",
        "3. Maximum Daily Study Time: Limit total daily study time to 1h30 - 2h30 (max 2 or 3 sessions of 45 minutes) on weekdays (monday to friday). Max 4h (max 5 sessions) on Saturdays.",
        "",
        "PEDAGOGICAL & SCHEDULING RULES:",
        "1. Free Hole Opportunities: If there is a large gap/hole (at least 2 hours) of free time between classes during the school day, schedule a small 45-minute study session in that gap.",
        "2. J-1 Revision: Prioritize scheduling revision sessions for subjects taught on the following school day (e.g., revise Math on Tuesday if Math class is on Wednesday).",
        "3. Cognitive Alternation: Do not schedule consecutive sessions of the same cognitive type (e.g., alternate Science/Math with Humanities/Languages/History-Geo).",
        "4. Saturday Cumulative Review: Schedule a 1h30 study block (2 consecutive 45-minute sessions separated by a 10-minute break) on Saturday morning for cumulative review. No new concepts; review everything studied during the week.",
        "5. Weak Subjects Focus: Schedule more sessions and give higher priority to subjects listed in weakSubjects.",
        "6. Active Recall Note Structure: Write the pedagogical_note in French. It must systematically structure the 45-minute session: 35 minutes of active recall / practice exercises, and 10 minutes of synthesis and self-testing without notes.",
        "",
        "OUTPUT FORMAT FEW-SHOT EXAMPLE:",
        "Your output must follow the schema. Example of one valid session element in the JSON array:",
        "{",
        "  \"day_of_week\": \"monday\",",
        "  \"start_time\": \"17:45\",",
        "  \"end_time\": \"18:30\",",
        "  \"subject\": \"Mathématiques\",",
        "  \"session_type\": \"review\",",
        "  \"pedagogical_note\": \"[35 min] Résolution active de 2 exercices sur les limites. [10 min] Synthèse par écrit des formules clés de mémoire.\"",
        "}"
      ].join("\n"),
    ],
    [
      "human",
      [
        "Extracted school timetable:",
        "{extractedTimetableMarkdown}",
        "",
        "Student profile context:",
        "{studentProfileContext}",
      ].join("\n"),
    ],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await chain.invoke(
    {
      extractedTimetableMarkdown: state.extractedTimetableMarkdown,
      studentProfileContext: state.studentProfileContext,
    },
    createTokenLogger("planner")
  )

  return {
    generatedPlanning: result.sessions,
  }
}
