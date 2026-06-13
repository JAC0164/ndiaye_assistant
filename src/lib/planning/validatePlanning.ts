import { GeneratedSeance } from "@/src/lib/langgraph/state"
import { BlockedSlot, ValidationError, ValidationResult } from "@/src/types/planning.types"
import { parseTime } from "./buildFreeSlots"

/**
 * Post-LLM hard constraint validator.
 * Lightweight: the algorithm guarantees budgets/slots; this catches LLM violations.
 */
export function validatePlanning(
  planning: GeneratedSeance[],
  allowedSubjects: string[],
  bedtime: string,
  blockedSlots: BlockedSlot[]
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []
  const removedSessions: GeneratedSeance[] = []
  const validatedPlanning: GeneratedSeance[] = []
  let wasRepaired = false

  const bedtimeMin = parseTime(bedtime)
  const normalizedAllowed = allowedSubjects.map(s => s.toLowerCase().trim())

  for (const session of planning) {
    let keepSession = true
    const sessionCopy = { ...session }

    // 1. Subject allowed check (ignore breaks)
    if (sessionCopy.session_type !== "break") {
      const subjectName = sessionCopy.subject.trim()
      const index = normalizedAllowed.indexOf(subjectName.toLowerCase())

      if (index === -1) {
        // Not in allowlist
        errors.push({
          check: "allowed_subject",
          severity: "error",
          message: `La matière "${sessionCopy.subject}" n'est pas autorisée dans l'emploi du temps de l'élève.`,
          session: sessionCopy,
        })
        removedSessions.push(sessionCopy)
        keepSession = false
        wasRepaired = true
      } else {
        // Canonicalize name if casing/spacing was slightly off
        if (sessionCopy.subject !== allowedSubjects[index]) {
          sessionCopy.subject = allowedSubjects[index]
          wasRepaired = true
        }
      }
    }

    if (!keepSession) {
      continue
    }

    // 2. Bedtime check: end_time > bedtime
    const endMin = parseTime(sessionCopy.end_time)
    if (endMin > bedtimeMin) {
      errors.push({
        check: "bedtime_boundary",
        severity: "error",
        message: `La séance de ${sessionCopy.subject} se termine après l'heure de coucher (${bedtime}).`,
        session: sessionCopy,
      })
    }

    // 3. Blocked slots check: Session overlaps blockedSlots
    const startMin = parseTime(sessionCopy.start_time)
    const day = sessionCopy.day_of_week.toLowerCase()

    for (const block of blockedSlots) {
      if (block.day.toLowerCase() === day) {
        const blockStart = parseTime(block.startTime)
        const blockEnd = parseTime(block.endTime)
        // Overlap condition: start1 < end2 && start2 < end1
        if (startMin < blockEnd && blockStart < endMin) {
          errors.push({
            check: "blocked_slot_overlap",
            severity: "error",
            message: `La séance de ${sessionCopy.subject} chevauche un créneau indisponible : ${block.reason} (${block.startTime}-${block.endTime}).`,
            session: sessionCopy,
          })
        }
      }
    }

    // 4. Pedagogical note empty check
    if (!sessionCopy.pedagogical_note || sessionCopy.pedagogical_note.trim() === "") {
      const fallback = sessionCopy.session_type === "break"
        ? "Fais une pause pour te détendre."
        : "Révise tes notes et refais les exercices clés."
      
      sessionCopy.pedagogical_note = fallback
      wasRepaired = true

      warnings.push({
        check: "empty_pedagogical_note",
        severity: "warning",
        message: `Note pédagogique manquante pour la séance de ${sessionCopy.subject}. Remplie avec une note par défaut.`,
        session: sessionCopy,
      })
    }

    validatedPlanning.push(sessionCopy)
  }

  return {
    validatedPlanning,
    wasRepaired,
    errors,
    warnings,
    removedSessions,
  }
}
