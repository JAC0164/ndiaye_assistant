import { ChatPromptTemplate } from "@langchain/core/prompts"

import { getModel, createTokenLogger } from "../model"
import {
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
  plannerAgentOutputSchema,
} from "../state"
import type { ModelProviderConfig } from "../providers"
import { withRetry } from "./withRetry"

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
        "Follow the structured output schema exactly for all fields (day_of_week, start_time, end_time, subject, session_type, pedagogical_note).",
        "",
        "SUBJECT CLASSIFICATION (Use for alternation and track priority):",
        "- Sciences (Calculations & Logic): Mathématiques, Physique-Chimie, SVT.",
        "- Humanities (Memorization & Writing): Philosophie, Histoire-Géographie, Français.",
        "- Languages & Communication: Anglais, Espagnol, Allemand, Arabe.",
        "",
        "STRICT RULES:",
        "- DO NOT schedule during class hours extracted from the school timetable.",
        "- DO NOT schedule during unavailable slots (blockedSlots) or after bedtime (bedtime) defined in the student profile.",
        "",
        "REST & HEALTH RULES:",
        "1. Decompression Gap (Mandatory): Schedule a 45-minute 'break' session starting EXACTLY when the last school class of the day ends or when a blocked activity ends.",
        "2. Sunday Rest: No study sessions on Sunday morning or afternoon. Max 1 review session on Sunday evening to prepare for Monday.",
        "3. Maximum Daily Study Time: 1h30 - 2h30 (max 2-3 sessions of 45 min) on weekdays. Max 4h on Saturdays.",
        "",
        "PEDAGOGICAL & SCHEDULING RULES:",
        "1. Free Hole Opportunities: If there is a gap of at least 2 hours between classes, schedule a 45-minute 'review' or 'tp' session in that gap.",
        "2. J-1 Revision: Prioritize 'review' sessions for subjects the student has class for on the next school day.",
        "3. Cognitive Alternation: No consecutive sessions of the same cognitive type.",
        "4. Saturday Cumulative Review: 1h30 study block (2 consecutive 45-min sessions + 10-min 'break') on Saturday morning.",
        "5. Weak Subjects Focus: Higher priority for weakSubjects and higher coefficient subjects.",
        "6. Active Recall Note Structure: Write pedagogical_note in French. For 'review'/'tp': 35 min active practice, 10 min synthesis. For 'break': short relaxation note.",
        "",
        "FEEDBACK LOOP (Données des 7 derniers jours) :",
        "- Une matière avec auto-évaluation basse ou absente du feedback doit être priorisée.",
        "- Si une matière a été complètement négligée (0 session), ajouter une session de rattrapage.",
        "- Si une matière montre un bon rythme (sessions régulières), maintenir ce créneau.",
        "- Ne pas empiler plus de 2 sessions sur une même matière par semaine.",
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
        "",
        "Official class subject coefficients:",
        "{subjectCoefficients}",
        "",
        "Weekly study feedback (last 7 days):",
        "{weeklyStats}",
      ].join("\n"),
    ],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await withRetry(
    () =>
      chain.invoke(
        {
          extractedTimetableMarkdown: state.extractedTimetableMarkdown,
          studentProfileContext: state.studentProfileContext,
          subjectCoefficients: state.subjectCoefficients || "Aucun coefficient spécifique disponible.",
          weeklyStats: state.weeklyStats || "Aucune session complétée cette semaine.",
        },
        createTokenLogger("planner")
      ),
    "planner"
  )

  return {
    generatedPlanning: result.sessions,
  }
}
