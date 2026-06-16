import { GeneratedSeance } from "@/src/lib/langgraph/state"
import { BlockedSlot, SubjectBudget, SubjectInfo, ValidationError, ValidationResult } from "@/src/types/planning.types"
import { parseTime } from "./buildFreeSlots"

/**
 * Validates and repairs the LLM-generated weekly revision plan.
 * Matches sessions against the deterministic draft planning to guarantee slot timings, days, and subjects.
 * Explicitly checks and rejects any sessions that exceed bedtime curfews or overlap with user blocked slots.
 * Identifies and flags pedagogical note violations (e.g. passive learning verbs).
 */
export function validatePlanning(
  planning: GeneratedSeance[],
  bedtime: string,
  blockedSlots: BlockedSlot[],
  options?: {
    budgets?: Map<string, SubjectBudget>
    weakSubjects?: string[]
    allSubjects?: SubjectInfo[]
    draftPlanning?: GeneratedSeance[]
  }
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []

  // Curfew and Blocked slots checks for the input planning sessions
  const bedtimeMinutes = parseTime(bedtime)
  for (const s of planning) {
    if (s.session_type === "break") continue

    const sStart = parseTime(s.start_time)
    const sEnd = parseTime(s.end_time)

    // 1. Bedtime curfew check
    if (sEnd > bedtimeMinutes) {
      errors.push({
        check: "bedtime",
        severity: "error",
        message: `La session de ${s.subject} dépasse l'heure du coucher (${s.end_time} > ${bedtime})`,
        session: s,
      })
    }

    // 2. Blocked slots check
    const dayBlocks = blockedSlots.filter((b) => b.day.toLowerCase() === s.day_of_week.toLowerCase())
    for (const block of dayBlocks) {
      const bStart = parseTime(block.startTime)
      const bEnd = parseTime(block.endTime)
      if (sStart < bEnd && sEnd > bStart) {
        errors.push({
          check: "blocked_slot",
          severity: "error",
          message: `La session de ${s.subject} chevauche le créneau bloqué ${block.startTime}-${block.endTime} (${block.reason})`,
          session: s,
        })
      }
    }
  }

  const draft = options?.draftPlanning || []
  if (draft.length === 0) {
    return {
      validatedPlanning: planning,
      wasRepaired: false,
      errors,
      warnings,
      removedSessions: [],
    }
  }

  const validated: GeneratedSeance[] = []
  let wasRepaired = errors.length > 0
  const removedSessions: GeneratedSeance[] = []

  const genSessions = [...planning]

  for (const d of draft) {
    const matchIdx = genSessions.findIndex(
      (g) =>
        g.day_of_week === d.day_of_week &&
        g.start_time === d.start_time &&
        g.end_time === d.end_time &&
        g.subject.trim().toUpperCase() === d.subject.trim().toUpperCase()
    )

    if (matchIdx !== -1) {
      const match = genSessions[matchIdx]
      genSessions.splice(matchIdx, 1)

      let session_type = match.session_type
      if (d.session_type === "break") {
        session_type = "break"
      } else if (session_type !== "review" && session_type !== "td") {
        session_type = d.session_type
        wasRepaired = true
        warnings.push({
          check: "session_type",
          severity: "warning",
          message: `Type de session invalide '${match.session_type}' réinitialisé à '${d.session_type}' pour ${d.subject}`,
          session: match,
        })
      }

      let note = (match.pedagogical_note || "").trim()
      const passiveVerbs = ["relire", "lire", "revoir", "regarder", "faire des fiches"]
      const lowerNote = note.toLowerCase()
      const hasPassive = passiveVerbs.some((verb) => lowerNote.includes(verb))

      if (hasPassive) {
        warnings.push({
          check: "passive_learning",
          severity: "warning",
          message: `La note pédagogique pour ${d.subject} contient un verbe d'apprentissage passif : "${note}"`,
          session: match,
        })
      }

      if (note === "" && d.session_type !== "break") {
        note = `Prends une feuille blanche et liste les concepts clés du cours de ${d.subject} — de mémoire !`
        wasRepaired = true
      }

      validated.push({
        day_of_week: d.day_of_week,
        start_time: d.start_time,
        end_time: d.end_time,
        subject: d.subject,
        session_type,
        pedagogical_note: note,
      })
    } else {
      wasRepaired = true
      errors.push({
        check: "missing_session",
        severity: "error",
        message: `Session manquante pour ${d.subject} le ${d.day_of_week} à ${d.start_time}-${d.end_time}. Restaurée à partir du brouillon.`,
      })

      let note = ""
      if (d.session_type !== "break") {
        note = `Explique à voix haute les notions clés du cours de ${d.subject} sans regarder tes supports.`
      }

      validated.push({
        ...d,
        pedagogical_note: note,
      })
    }
  }

  if (genSessions.length > 0) {
    wasRepaired = true
    for (const extra of genSessions) {
      removedSessions.push(extra)
      errors.push({
        check: "extra_session",
        severity: "error",
        message: `Session superflue '${extra.subject}' le ${extra.day_of_week} à ${extra.start_time}-${extra.end_time} ignorée.`,
        session: extra,
      })
    }
  }

  return {
    validatedPlanning: validated,
    wasRepaired,
    errors,
    warnings,
    removedSessions,
  }
}
