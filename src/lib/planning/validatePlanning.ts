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

      // Filter out exceptions like "sans regarder" or "sans relire" before matching
      // We allow up to 3 words between 'sans' and the verb to catch 'sans jamais regarder', 'sans les relire', etc.
      const noteWithoutSans = lowerNote.replace(
        /sans(?:\s+\w+){0,3}\s+(?:relire|lire|revoir|regarder|faire\s+des\s+fiches)/g,
        ""
      )
      const hasPassive = passiveVerbs.some((verb) => {
        const regex = new RegExp(`\\b${verb}\\b`, "i")
        return regex.test(noteWithoutSans)
      })

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

  const finalValidated: GeneratedSeance[] = []
  const usedMinutes = new Map<string, number>()

  if (options?.budgets) {
    for (const session of validated) {
      if (session.session_type === "break") {
        finalValidated.push(session)
        continue
      }

      const subj = session.subject.trim().toUpperCase()
      const budgetObj =
        options.budgets.get(session.subject) ||
        Array.from(options.budgets.entries()).find(([k]) => k.trim().toUpperCase() === subj)?.[1]

      if (budgetObj) {
        const currentlyUsed = usedMinutes.get(subj) || 0
        const sStart = parseTime(session.start_time)
        const sEnd = parseTime(session.end_time)
        const duration = sEnd - sStart

        // Allow up to a 15-minute overrun to account for slight rounding, but completely prune if well over.
        if (currentlyUsed > 0 && currentlyUsed + duration > budgetObj.totalMinutes + 15) {
          wasRepaired = true
          removedSessions.push(session)
          errors.push({
            check: "budget_exceeded",
            severity: "error",
            message: `Session supprimée : le budget pour ${session.subject} a explosé (${
              currentlyUsed + duration
            } min > ${budgetObj.totalMinutes} min)`,
            session,
          })
          continue
        }

        usedMinutes.set(subj, currentlyUsed + duration)
      }

      finalValidated.push(session)
    }
  } else {
    finalValidated.push(...validated)
  }

  // Interleaving repair pass: fix consecutive sessions of the same subject on the same day
  if (options?.budgets && options?.allSubjects) {
    let lastStudySubject: string | null = null
    let lastStudyDay: string | null = null

    for (let i = 0; i < finalValidated.length; i++) {
      const s = finalValidated[i]
      if (s.session_type !== "break") {
        if (s.day_of_week === lastStudyDay && s.subject === lastStudySubject) {
          // Interleaving violation found!
          const sStart = parseTime(s.start_time)
          const sEnd = parseTime(s.end_time)
          const duration = sEnd - sStart

          // Find candidate subjects with enough budget
          const candidates = options.allSubjects
            .filter((sub) => sub.name !== lastStudySubject)
            .map((sub) => {
              const budgetObj = options.budgets!.get(sub.name)
              const used = usedMinutes.get(sub.name) || 0
              const remaining = budgetObj ? budgetObj.totalMinutes - used : 0
              return { name: sub.name, remaining }
            })
            .filter((sub) => sub.remaining >= duration)
            .sort((a, b) => b.remaining - a.remaining) // Prefer subjects with most remaining budget

          if (candidates.length > 0) {
            const replacement = candidates[0].name

            // Adjust used budgets
            const currentlyUsed = usedMinutes.get(replacement) || 0
            usedMinutes.set(replacement, currentlyUsed + duration)
            const oldUsed = usedMinutes.get(lastStudySubject) || 0
            usedMinutes.set(lastStudySubject, Math.max(0, oldUsed - duration))

            s.subject = replacement
            wasRepaired = true
            warnings.push({
              check: "interleaving",
              severity: "warning",
              message: `Interleaving corrigé : ${lastStudySubject} a été remplacé par ${replacement} pour éviter deux sessions consécutives.`,
              session: { ...s }, // clone to avoid mutation reference issues in logs
            })
            lastStudySubject = s.subject // Update last study subject to the replacement
          } else {
            // Cannot replace, so we must drop it to respect interleaving
            removedSessions.push({ ...s })

            const oldUsed = usedMinutes.get(lastStudySubject) || 0
            usedMinutes.set(lastStudySubject, Math.max(0, oldUsed - duration))

            errors.push({
              check: "interleaving",
              severity: "error",
              message: `Session supprimée : ${lastStudySubject} apparaissait deux fois de suite et aucune autre matière n'avait le budget nécessaire.`,
              session: { ...s },
            })

            finalValidated.splice(i, 1)
            i-- // Adjust index
            wasRepaired = true
            continue // Do not update lastStudySubject because this session is removed
          }
        } else {
          lastStudySubject = s.subject
          lastStudyDay = s.day_of_week
        }
      }
    }
  }

  const cleanedValidated: GeneratedSeance[] = []
  for (let i = 0; i < finalValidated.length; i++) {
    const s = finalValidated[i]
    if (s.session_type === "break") {
      const prev = i > 0 ? finalValidated[i - 1] : null
      const next = i < finalValidated.length - 1 ? finalValidated[i + 1] : null

      const isOrphan =
        !prev ||
        !next ||
        prev.day_of_week !== s.day_of_week ||
        next.day_of_week !== s.day_of_week ||
        prev.session_type === "break" ||
        next.session_type === "break"

      if (isOrphan) {
        continue
      }
    }
    cleanedValidated.push(s)
  }

  return {
    validatedPlanning: cleanedValidated,
    wasRepaired,
    errors,
    warnings,
    removedSessions,
  }
}
