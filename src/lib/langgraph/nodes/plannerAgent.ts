import { ChatPromptTemplate } from "@langchain/core/prompts"

import { getModel, createTokenLogger } from "../model"
import { logger } from "@/src/lib/logger"
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
        "Role: Planner Agent. Build a cyclic 7-day weekly study schedule using flexible session durations (30 to 45 minutes) to ensure all subjects are covered.",
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
        "- DO NOT invent subjects that are not in the student's timetable.",
        "",
        "SESSION TYPE MAPPING (for study sessions outside class hours):",
        "- review: Consolidation, J-1 revision, rereading notes, memorization.",
        "- td (Travaux Dirigés): Exercise solving, problem sets, application exercises.",
        "- break: Rest, decompression, pause.",
        "",
        "REST & HEALTH RULES:",
        "1. Decompression Gap (Mandatory): Schedule a 30 to 45-minute 'break' session starting EXACTLY when the last school class of the day ends or when a blocked activity ends. For ALL 'break' sessions, the `subject` field MUST be exactly 'Pause' or 'Détente' (DO NOT use an academic subject name for a break).",
        "2. Sunday Rest: No study sessions on Sunday morning or afternoon. Max 1 review session on Sunday evening to prepare for Monday.",
        "3. Maximum Daily Study Time: 1h30 - 2h30 on weekdays. Max 4h on Saturdays.",
        "",
        "PEDAGOGICAL & SCHEDULING RULES:",
        "1. Free Hole Opportunities: If there is a gap of at least 2 hours between classes, schedule a session in that gap.",
        "2. J-1 Revision: Prioritize 'review' sessions for subjects the student has class for on the next school day.",
        "3. Cognitive Alternation: No consecutive sessions of the same cognitive type.",
        "4. Evening Study Block: Group the evening study sessions into a coherent block (e.g. between 19:00 and 21:30) to allow time for dinner after the decompression break, instead of packing all study immediately after school.",
        "5. Spacing: Ensure a 10 to 15-minute gap between consecutive study sessions for optimal focus.",
        "6. Saturday Cumulative Review: 1h30 to 2h study block on Saturday morning.",
        "7. Complete Coverage (Mandatory): You MUST schedule at least one study session for EVERY academic subject present in the school timetable (except Développement Personnel).",
        "8. High Coefficient & Weak Subjects Focus: Allocate more sessions (e.g. 2 sessions per week instead of 1) to subjects with high coefficients or identified as weakSubjects.",
        "9. Active Recall Note Structure: Write pedagogical_note in French. Specify the active practice time vs synthesis time based on the session's duration.",
        "10. Upcoming Exams Focus (Mandatory): If an exam or homework is listed in upcoming deadlines, you MUST schedule an intensive preparation session for that subject before the due date. The pedagogical_note must mention the preparation.",
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
        "",
        "Upcoming deadlines (homework, exams, compositions due within 7 days):",
        "{upcomingEcheances}",
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
          upcomingEcheances: state.upcomingEcheances || "Aucune échéance à venir.",
        },
        createTokenLogger("planner")
      ),
    "planner"
  )

  return {
    generatedPlanning: result.sessions,
  }
}
