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
        "- Session Type: Allowed session types are 'review', 'tp', and 'break'. Use 'break' for mandatory rests and 'tp' for practical exercises.",
        "- Time Format: Use HH:mm format for start_time and end_time.",
        "- Days Format: Use lowercase English days (monday, tuesday, wednesday, thursday, friday, saturday, sunday).",
        "",
        "REST & HEALTH RULES:",
        "1. Decompression Gap (Mandatory): You MUST schedule a 45-minute 'break' session that starts EXACTLY when the last school class of the day ends or when a blocked activity ends (do not leave empty space before this break).",
        "2. Sunday Rest: Sunday must be dedicated to rest. Do not schedule study sessions on Sunday morning or afternoon. Max 1 review session on Sunday evening to prepare for Monday.",
        "3. Maximum Daily Study Time: Limit total daily study time to 1h30 - 2h30 (max 2 or 3 sessions of 45 minutes) on weekdays. Max 4h on Saturdays.",
        "",
        "PEDAGOGICAL & SCHEDULING RULES:",
        "1. Free Hole Opportunities: If there is a gap of at least 2 hours between classes during the school day, schedule a small 45-minute 'review' or 'tp' session in that gap.",
        "2. J-1 Revision: Prioritize scheduling 'review' sessions for subjects that the student has class for on the VERY NEXT school day. Do not schedule a J-1 review if the student doesn't have that class tomorrow.",
        "3. Cognitive Alternation: Do not schedule consecutive sessions of the same cognitive type.",
        "4. Saturday Cumulative Review: Schedule a 1h30 study block (2 consecutive 45-minute sessions separated by a 10-minute 'break') on Saturday morning for cumulative review.",
        "5. Weak Subjects Focus: Give higher priority to subjects listed in weakSubjects. Also weight study time allocation using the official Baccalauréat class coefficients: higher coefficient subjects should receive relatively more study sessions.",
        "6. Active Recall Note Structure: Write the pedagogical_note in French. For 'review' and 'tp', structure the 45-minute session: 35 minutes active practice, 10 minutes synthesis. For 'break', write a short relaxation note.",
        "",
        "OUTPUT FORMAT FEW-SHOT EXAMPLES:",
        "Your output must follow the schema. Examples:",
        "Example 1 (Review):",
        "{{",
        "  \"day_of_week\": \"monday\",",
        "  \"start_time\": \"17:45\",",
        "  \"end_time\": \"18:30\",",
        "  \"subject\": \"Mathématiques\",",
        "  \"session_type\": \"review\",",
        "  \"pedagogical_note\": \"[35 min] Résolution active de 2 exercices sur les limites. [10 min] Synthèse par écrit des formules clés.\"",
        "}}",
        "Example 2 (Break / Decompression):",
        "{{",
        "  \"day_of_week\": \"tuesday\",",
        "  \"start_time\": \"17:10\",",
        "  \"end_time\": \"18:00\",",
        "  \"subject\": \"Pause Décompression\",",
        "  \"session_type\": \"break\",",
        "  \"pedagogical_note\": \"Prendre l'air, s'hydrater et se reposer après les cours.\"",
        "}}",
        "Example 3 (TP in a free hole):",
        "{{",
        "  \"day_of_week\": \"wednesday\",",
        "  \"start_time\": \"14:30\",",
        "  \"end_time\": \"15:15\",",
        "  \"subject\": \"Physique-Chimie\",",
        "  \"session_type\": \"tp\",",
        "  \"pedagogical_note\": \"[35 min] Refaire le TP sur les titrages. [10 min] Vérifier les calculs d'incertitude.\"",
        "}}"
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
      ].join("\n"),
    ],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await chain.invoke(
    {
      extractedTimetableMarkdown: state.extractedTimetableMarkdown,
      studentProfileContext: state.studentProfileContext,
      subjectCoefficients: state.subjectCoefficients || "Aucun coefficient spécifique disponible.",
    },
    createTokenLogger("planner")
  )

  return {
    generatedPlanning: result.sessions,
  }
}
