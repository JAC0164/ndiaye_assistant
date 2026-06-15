import { GeneratedSeance } from "@/src/lib/langgraph/state"
import { BlockedSlot, SubjectBudget, SubjectInfo, ValidationError, ValidationResult } from "@/src/types/planning.types"
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
  blockedSlots: BlockedSlot[],
  options?: {
    budgets?: Map<string, SubjectBudget>
    weakSubjects?: string[]
    allSubjects?: SubjectInfo[]
  }
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
        if (startMin < blockEnd && blockStart < endMin) {
          errors.push({
            check: "blocked_slot_overlap",
            severity: "error",
            message: `La séance de ${sessionCopy.subject} chevauche un créneau indisponible : ${block.reason} (${block.startTime}-${block.endTime}).`,
            session: sessionCopy,
          })
          keepSession = false
          wasRepaired = true
          removedSessions.push(sessionCopy)
        }
      }
    }

    // 4. Oversized break check (> 60 min = LLM hallucination)
    const breakDuration = endMin - startMin
    if (sessionCopy.session_type === "break" && breakDuration > 60) {
      warnings.push({
        check: "oversized_break_block",
        severity: "warning",
        message: `Pause de ${breakDuration} min supprimée (max 30 min). Le créneau correspond probablement à un bloc indisponible.`,
        session: sessionCopy,
      })
      removedSessions.push(sessionCopy)
      wasRepaired = true
      continue
    }

    // 5. Pedagogical note empty check
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

    // 6. Passive verb check (Active Recall enforcement)
    if (sessionCopy.session_type !== "break" && sessionCopy.pedagogical_note) {
      const hasPassive = /(?<!sans\s)(?:^|\.\s+|!\s+)(?:relire|revoir|regarder|faire des fiches|lire\s)/gi.test(
        sessionCopy.pedagogical_note
      )
      if (hasPassive) {
        warnings.push({
          check: "passive_verb_detected",
          severity: "warning",
          message: `La note pédagogique contient un verbe passif. Remplace-le par une action concrète (schématise, résous, explique...).`,
          session: sessionCopy,
        })
      }
    }

    // 7. Undersized session check
    if (sessionCopy.session_type !== "break") {
      const sessionDuration = endMin - startMin
      if (sessionDuration < PLANNING_CONFIG.minSessionMinutes) {
        warnings.push({
          check: "undersized_session",
          severity: "warning",
          message: `La séance de ${sessionCopy.subject} ne dure que ${sessionDuration} min (minimum ${PLANNING_CONFIG.minSessionMinutes} min).`,
          session: sessionCopy,
        })
      }
    }

    validatedPlanning.push(sessionCopy)
  }

  // 8. Free day session cap (saturday, sunday)
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

  // 9. Eat the Frog check: first study slot on Sat/Sun must be highest-coeff weak subject
  if (options?.weakSubjects && options.weakSubjects.length > 0 && options?.allSubjects) {
    const weakUpper = options.weakSubjects.map((s) => s.trim().toUpperCase())
    const weakWithCoeff = options.allSubjects.filter((s) => weakUpper.includes(s.name))
    const highestWeak = weakWithCoeff.reduce(
      (max, s) => (s.coefficient > (max?.coefficient || 0) ? s : max),
      weakWithCoeff[0]
    )
    if (highestWeak) {
      for (const day of ["saturday", "sunday"]) {
        const first = validatedPlanning.find((s) => s.day_of_week.toLowerCase() === day && s.session_type !== "break")
        if (first && first.subject !== highestWeak.name) {
          warnings.push({
            check: "eat_the_frog",
            severity: "warning",
            message: `Le ${day} devrait commencer par ${highestWeak.name} (coefficient ${highestWeak.coefficient}) mais commence par ${first.subject}.`,
            session: first,
          })
        }
      }
    }
  }

  // 10. Budget exceeded check (aggregate: total planned per subject vs weekly budget)
  if (options?.budgets) {
    const subjectTotals = new Map<string, number>()
    for (const s of validatedPlanning) {
      if (s.session_type === "break") continue
      const dur = parseTime(s.end_time) - parseTime(s.start_time)
      subjectTotals.set(s.subject, (subjectTotals.get(s.subject) || 0) + dur)
    }
    for (const [subject, total] of subjectTotals) {
      const budget = options.budgets.get(subject)
      if (budget) {
        const tolerance = Math.round(budget.totalMinutes * 0.15)
        if (total > budget.totalMinutes + tolerance) {
          warnings.push({
            check: "budget_exceeded",
            severity: "warning",
            message: `Le budget temps de ${subject} est dépassé : ${total} min planifiées sur ${budget.totalMinutes} min autorisées (tolérance ${tolerance} min).`,
          })
        }
      }
    }
  }

  // 11. Cleanup orphan breaks
  const cleanedPlanning: GeneratedSeance[] = []
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

  for (const day of days) {
    const daySessions = validatedPlanning.filter((s) => s.day_of_week.toLowerCase() === day)
    daySessions.sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time))

    const filteredDay: GeneratedSeance[] = []
    for (let i = 0; i < daySessions.length; i++) {
      const s = daySessions[i]
      if (s.session_type === "break") {
        const prev = filteredDay.length > 0 ? filteredDay[filteredDay.length - 1] : null
        const next = daySessions.slice(i + 1).find((x) => x.session_type !== "break")

        if (prev && prev.session_type !== "break" && next) {
          filteredDay.push(s)
        } else {
          removedSessions.push(s)
          wasRepaired = true
        }
      } else {
        filteredDay.push(s)
      }
    }
    cleanedPlanning.push(...filteredDay)
  }

  validatedPlanning.splice(0, validatedPlanning.length, ...cleanedPlanning)

  // 7. Inject missing pauses for intra-day gaps
  const withPauses: GeneratedSeance[] = []
  for (const day of days) {
    const daySessions = validatedPlanning.filter((s) => s.day_of_week.toLowerCase() === day)
    daySessions.sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time))

    const filledDay: GeneratedSeance[] = []
    for (let i = 0; i < daySessions.length; i++) {
      filledDay.push(daySessions[i])
      if (i < daySessions.length - 1) {
        const current = daySessions[i]
        const next = daySessions[i + 1]
        const currentEnd = parseTime(current.end_time)
        const nextStart = parseTime(next.start_time)

        if (currentEnd < nextStart) {
          const gap = nextStart - currentEnd
          const breakEnd = Math.min(currentEnd + PLANNING_CONFIG.betweenSessionBreakMinutes, nextStart)
          const newBreak: GeneratedSeance = {
            day_of_week: current.day_of_week,
            start_time: current.end_time,
            end_time: formatTime(breakEnd),
            subject: "Pause",
            session_type: "break",
            pedagogical_note: "Détente bien méritée !",
          }
          filledDay.push(newBreak)
        }
      }
    }
    withPauses.push(...filledDay)
  }

  validatedPlanning.splice(0, validatedPlanning.length, ...withPauses)

  return {
    validatedPlanning,
    wasRepaired,
    errors,
    warnings,
    removedSessions,
  }
}
