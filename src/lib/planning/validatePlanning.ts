import { GeneratedSeance } from "@/src/lib/langgraph/state"
import { BlockedSlot, ValidationError, ValidationResult } from "@/src/types/planning.types"
import { parseTime, formatTime } from "./buildFreeSlots"
import { PLANNING_CONFIG } from "./planningConfig"

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
  const normalizedAllowed = allowedSubjects.map((s) => s.toLowerCase().trim())

  // Step 0: session_duration_cap — slice oversized sessions
  const preprocessed: GeneratedSeance[] = []
  for (const session of planning) {
    const startMin = parseTime(session.start_time)
    const endMin = parseTime(session.end_time)
    const duration = endMin - startMin

    if (duration > PLANNING_CONFIG.maxSessionMinutes && session.session_type !== "break") {
      errors.push({
        check: "session_duration_cap",
        severity: "error",
        message: `La session de ${session.subject} le ${session.day_of_week} dépassait ${PLANNING_CONFIG.maxSessionMinutes} min (${duration} min). Elle a été découpée.`,
        session,
      })
      wasRepaired = true

      // Slice into 35-min study blocks separated by 10-min pauses
      let cursor = startMin
      while (cursor < endMin) {
        const remaining = endMin - cursor
        const blockDuration = Math.min(35, remaining)
        preprocessed.push({
          ...session,
          start_time: formatTime(cursor),
          end_time: formatTime(cursor + blockDuration),
        })
        cursor += blockDuration

        // Insert pause if there's enough time for another study block after it
        const afterPause = cursor + PLANNING_CONFIG.betweenSessionBreakMinutes
        if (afterPause < endMin && endMin - afterPause >= PLANNING_CONFIG.minSessionMinutes) {
          preprocessed.push({
            day_of_week: session.day_of_week,
            start_time: formatTime(cursor),
            end_time: formatTime(afterPause),
            subject: "Pause",
            session_type: "break",
            pedagogical_note: "Fais une pause pour te détendre.",
          })
          cursor = afterPause
        } else {
          break // not enough room for pause + study block
        }
      }
    } else {
      preprocessed.push(session)
    }
  }

  for (const session of preprocessed) {
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
      const fallback =
        sessionCopy.session_type === "break"
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

  // 5. Free day session cap (saturday, sunday)
  const freeDays = ["saturday", "sunday"]
  for (const day of freeDays) {
    const daySessions = validatedPlanning.filter(
      (s) => s.day_of_week.toLowerCase() === day && s.session_type !== "break"
    )
    const excess = daySessions.length - PLANNING_CONFIG.maxSessionsPerFreeDay
    if (excess > 0) {
      const toRemove = daySessions.slice(-excess)
      const removeSet = new Set(toRemove)
      for (let i = validatedPlanning.length - 1; i >= 0; i--) {
        if (removeSet.has(validatedPlanning[i])) {
          validatedPlanning.splice(i, 1)
        }
      }
      removedSessions.push(...toRemove)
      wasRepaired = true
      errors.push({
        check: "free_day_session_cap",
        severity: "error",
        message: `Le ${day === "saturday" ? "samedi" : "dimanche"} a ${daySessions.length} séances (max ${PLANNING_CONFIG.maxSessionsPerFreeDay}). ${excess} séance(s) supprimée(s).`,
      })
    }
  }

  return {
    validatedPlanning,
    wasRepaired,
    errors,
    warnings,
    removedSessions,
  }
}
