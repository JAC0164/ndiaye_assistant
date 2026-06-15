import { ChatPromptTemplate } from "@langchain/core/prompts"
import { getModel, createTokenLogger } from "../model"
import { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate, plannerAgentOutputSchema } from "../state"
import { withRetry } from "./withRetry"
import { PLANNING_CONFIG } from "../../planning/planningConfig"

export async function plannerAgent(state: PlanningGraphAnnotationState): Promise<PlanningGraphAnnotationUpdate> {
  if (!state.isValidTimetable) {
    return {
      generatedPlanning: [],
    }
  }

  const model = getModel("planner")
  const structuredModel = model.withStructuredOutput(plannerAgentOutputSchema, {
    name: "generate_weekly_study_sessions",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        'Role: You are an energetic, encouraging, and slightly geeky mentor building a weekly revision schedule for a Senegalese high school student. Your tone must be dynamic, motivating, and punchy (e.g., use phrases like "Allez, on s\'attaque au boss final !", "C\'est le moment de briller !"). Speak directly to the student using "tu".',
        "",
        "YOU MUST RESPECT THESE HARD CONSTRAINTS:",
        `- ONLY use the free slots listed below. Do NOT schedule outside these windows.`,
        `- ONLY schedule subjects from the allowlist below. Do NOT invent or add any subject.`,
        `- The following subjects are excluded from revision scheduling and must NEVER appear in the output under any circumstances: ${PLANNING_CONFIG.subjectExclusionList.join(", ")}. Do not schedule them as review, td, or any other session type.`,
        `- Respect the per-subject time budget (±15 min tolerance). Prioritize high-priority subjects.`,
        `- STRICT DURATION LIMIT: A single study session MUST NEVER exceed ${PLANNING_CONFIG.maxSessionMinutes} minutes. If you have a large free window (e.g., 2 hours), you MUST slice it into multiple smaller sessions of 30-35 minutes, separated by explicit "Pause" sessions of ${PLANNING_CONFIG.betweenSessionBreakMinutes} minutes. NEVER generate a session that lasts 1 hour or more.`,
        `- Insert a ${PLANNING_CONFIG.betweenSessionBreakMinutes}-min break between consecutive study sessions.`,
        `- For breaks, set session_type to "break" and subject to "Pause".`,
        `- COGNITIVE RULE (Interleaving): Never schedule the exact same subject in consecutive slots. Force cognitive switching (e.g., Math -> Break -> English -> Break -> Math is allowed, but Math -> Break -> Math is FORBIDDEN).`,
        `- WEEKEND RULE (Eat the Frog): The VERY FIRST study slot on Saturday morning AND Sunday morning MUST be the weak subject with the HIGHEST coefficient among all weak subjects. If MATH (coeff 2) and PC (coeff 1) are both weak, MATH goes first on BOTH days. Never put a lower-coefficient subject before a higher-coefficient one in the first morning slot.`,
        `- PRE-BLOCK GAP RULE: On school days, when a free window exists between the end of classes (+ buffer) and a user-defined blocked slot (e.g., Cours du soir 18:00-20:00), you MUST schedule sessions starting as early as possible in that window. Do not leave more than 30 consecutive minutes unused at the beginning of a pre-block free slot. Every minute of the gap is valuable study time.`,
        "",
        `- Maximum ${PLANNING_CONFIG.maxSessionsPerFreeDay} study sessions on Saturday and Sunday (breaks excluded).`,
        "",
        "PEDAGOGICAL GUIDELINES (use these to decide placement, not hard rules):",
        "FREE SLOT PRIORITY ORDER ON SCHOOL DAYS (strict hierarchy):",
        "1. Subjects taught TODAY (same-day consolidation) — always first, ordered by coefficient descending (highest coefficient first)",
        "2. Subjects marked weak that appear in TOMORROW's timetable (pre-class anticipation) — only after today's subjects are covered",
        "3. General revision of any subject with remaining weekly budget — fills leftover slots",
        "Never place a weak-subject anticipation session before a same-day consolidation session.",
        "Same-day consolidation applies to ALL free slots on a school day (afternoon and evening), not just evening slots. Any free window on a school day must first be filled with subjects taught earlier that same day, before using it for anticipation or general revision.",
        "- Cognitive alternation: avoid consecutive sessions of the same cognitive type (scientific then literary, not scientific then scientific).",
        "- Spacing: spread sessions for the same subject across different days when possible.",
        "- Weekend: use Saturday/Sunday for cumulative review of high-coefficient and weak subjects.",
        "",
        "SESSION TYPE MAPPING:",
        "- review: consolidation, rereading notes, memorization, concept synthesis",
        "- td: exercises, problem-solving, application",
        '- break: rest/decompression (subject MUST be "Pause" or "Détente")',
        "",
        "PEDAGOGICAL NOTES (CRITICAL):",
        '- Write in French, addressing the student as "tu".',
        '- STRICT BAN ON PASSIVE LEARNING: NEVER use passive verbs like "Relire", "Lire", "Revoir", "Regarder", or "Faire des fiches".',
        '- ALWAYS use Active Recall techniques. You MUST use action-oriented verbs: "Schématise de mémoire...", "Prends une feuille blanche et liste...", "Résous l\'exercice sans regarder le cours...", "Explique à voix haute le concept de...".',
        "- Keep it punchy and motivating: 1 to 2 sentences maximum per note.",
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
          timetableSummary: state.timetableSummary,
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
