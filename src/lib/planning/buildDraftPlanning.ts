import type { ExtractedTimetable, FreeSlot, SubjectInfo, SubjectBudget, BudgetTracker } from "@/src/types/planning.types"
import type { GeneratedSeance } from "../langgraph/state"
import { PLANNING_CONFIG } from "./planningConfig"
import { formatTime, parseTime } from "./buildFreeSlots"
import { DAYS } from "./constants"

/**
 * Deterministically constructs a draft weekly revision plan.
 * Allocates subjects into free slots based on priority, budgets, and pedagogical guidelines.
 * AI will review and enrich this draft with pedagogical notes.
 */
export function buildDraftPlanning(
  subjects: SubjectInfo[],
  budgets: Map<string, SubjectBudget>,
  priorities: Map<string, number>,
  freeSlots: FreeSlot[],
  onboarding: { weakSubjects?: string[] } = {},
  timetable: ExtractedTimetable
): GeneratedSeance[] {
  const sessions: GeneratedSeance[] = []

  // 1. Initialize budget trackers
  const budgetTracker = new Map<string, BudgetTracker>()
  for (const subject of subjects) {
    const b = budgets.get(subject.name) || { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }
    budgetTracker.set(subject.name, {
      subject: subject.name,
      totalBudget: b.totalMinutes,
      usedMinutes: 0,
      reviewUsed: 0,
      tdUsed: 0,
      remainingMinutes: b.totalMinutes,
    })
  }

  // 2. Identify weak subjects and frog subject (weak subject with highest coefficient)
  const weakSubjectsList = (onboarding.weakSubjects || []).map((s) => s.trim().toUpperCase())
  const weakSubjectsSet = new Set(weakSubjectsList)

  const frogSubject = subjects
    .filter((s) => weakSubjectsSet.has(s.name))
    .sort((a, b) => b.coefficient - a.coefficient || a.name.localeCompare(b.name))[0]?.name || null

  // 3. For weekday same-day consolidation and anticipation, map subjects taught on each day
  const subjectsTaughtOnDay = new Map<string, string[]>()
  for (const day of DAYS) {
    const dayEntry = timetable.days?.find((d) => d.day.toLowerCase() === day)
    const daySubjects =
      dayEntry?.slots
        ?.map((s) => s.subject.trim().toUpperCase())
        .filter((v, i, self) => self.indexOf(v) === i) || []
    subjectsTaughtOnDay.set(day, daySubjects)
  }

  const getTomorrow = (day: string): string => {
    const idx = DAYS.indexOf(day as (typeof DAYS)[number])
    return DAYS[(idx + 1) % 7]
  }

  // 4. Generate draft sessions for each day of the week
  for (const day of DAYS) {
    const isWeekend = day === "saturday" || day === "sunday"

    // Find free slots for this day
    const dayFreeSlots = freeSlots.filter((s) => s.day.toLowerCase() === day)
    if (dayFreeSlots.length === 0) continue

    const dayStudySlots: { start: number; end: number; duration: number }[] = []

    if (!isWeekend) {
      // For weekdays, free slots are large windows. Split them into study slots and breaks.
      for (const slot of dayFreeSlots) {
        const slotStart = parseTime(slot.start)
        const slotEnd = parseTime(slot.end)
        let cursor = slotStart
        let sessionsAdded = 0

        while (cursor + PLANNING_CONFIG.minSessionMinutes <= slotEnd && sessionsAdded < 3) {
          if (sessionsAdded > 0) {
            // Add break session
            sessions.push({
              day_of_week: day,
              start_time: formatTime(cursor),
              end_time: formatTime(cursor + PLANNING_CONFIG.betweenSessionBreakMinutes),
              subject: "Break",
              session_type: "break",
              pedagogical_note: "",
            })
            cursor += PLANNING_CONFIG.betweenSessionBreakMinutes
          }

          let duration = 35 // Target duration
          // If this is the last session we can fit, extend it to absorb remaining window up to 45 min
          const isLastPossible =
            cursor + 35 + PLANNING_CONFIG.betweenSessionBreakMinutes + PLANNING_CONFIG.minSessionMinutes > slotEnd ||
            sessionsAdded === 2
          if (isLastPossible) {
            duration = Math.min(slotEnd - cursor, PLANNING_CONFIG.maxSessionMinutes)
          }

          dayStudySlots.push({
            start: cursor,
            end: cursor + duration,
            duration,
          })

          cursor += duration
          sessionsAdded++
        }
      }
    } else {
      // For weekends, free slots are already the pre-split study slots.
      // We sort them and map them.
      const sortedSlots = [...dayFreeSlots].sort((a, b) => parseTime(a.start) - parseTime(b.start))
      for (let i = 0; i < sortedSlots.length; i++) {
        const slot = sortedSlots[i]
        const slotStart = parseTime(slot.start)
        const slotEnd = parseTime(slot.end)

        // If there was a gap since the last study slot, insert a break
        if (i > 0) {
          const prevSlot = sortedSlots[i - 1]
          const prevEnd = parseTime(prevSlot.end)
          if (slotStart - prevEnd >= 5) {
            sessions.push({
              day_of_week: day,
              start_time: formatTime(prevEnd),
              end_time: formatTime(slotStart),
              subject: "Break",
              session_type: "break",
              pedagogical_note: "",
            })
          }
        }

        dayStudySlots.push({
          start: slotStart,
          end: slotEnd,
          duration: slotEnd - slotStart,
        })
      }
    }

    // Now, assign subjects to dayStudySlots for this day
    let lastSubject: string | null = null
    let lastSubjectType: string | null = null
    let weekendWeakCount = 0
    const subjectsScheduledToday = new Set<string>()

    for (let slotIdx = 0; slotIdx < dayStudySlots.length; slotIdx++) {
      const slot = dayStudySlots[slotIdx]
      let selectedSubject: string | null = null

      if (isWeekend) {
        // Weekend placement logic
        if (slotIdx === 0 && frogSubject) {
          // "Eat the frog": first session of weekend is the frog subject
          selectedSubject = frogSubject
        } else {
          // General weekend placement: prioritize weak subjects if we need to hit the 50% threshold,
          // or just pick by priority score.
          const totalWeekendSlots = dayStudySlots.length
          const halfWeekend = Math.ceil(totalWeekendSlots / 2)
          const needsWeak = weekendWeakCount < halfWeekend

          // Get candidates
          let candidates = subjects.filter((s) => s.name !== lastSubject)

          if (needsWeak) {
            // Filter candidates to weak subjects first
            const weakCandidates = candidates.filter((s) => weakSubjectsSet.has(s.name))
            if (weakCandidates.length > 0) {
              candidates = weakCandidates
            }
          }

          // Sort candidates:
          // 1. Alternate cognitive type if possible
          // 2. Remaining budget first
          // 3. High priority score
          candidates.sort((a, b) => {
            const trackerA = budgetTracker.get(a.name)!
            const trackerB = budgetTracker.get(b.name)!
            const hasBudgetA = trackerA.remainingMinutes > 0 ? 1 : 0
            const hasBudgetB = trackerB.remainingMinutes > 0 ? 1 : 0
            if (hasBudgetA !== hasBudgetB) {
              return hasBudgetB - hasBudgetA
            }
            const typeAltA = a.subjectType !== lastSubjectType ? 1 : 0
            const typeAltB = b.subjectType !== lastSubjectType ? 1 : 0
            if (typeAltA !== typeAltB) {
              return typeAltB - typeAltA
            }
            const prioA = priorities.get(a.name)!
            const prioB = priorities.get(b.name)!
            return prioB - prioA || a.name.localeCompare(b.name)
          })

          if (candidates.length > 0) {
            selectedSubject = candidates[0].name
          } else {
            // Fallback: relax interleaving - pick highest priority
            let best: SubjectInfo | null = null
            let bestPrio = -1
            for (const s of subjects) {
              const prio = priorities.get(s.name)!
              if (prio > bestPrio) {
                bestPrio = prio
                best = s
              }
            }
            selectedSubject = best?.name || null
          }
        }

        if (selectedSubject && weakSubjectsSet.has(selectedSubject)) {
          weekendWeakCount++
        }
      } else {
        // Weekday placement logic
        const todaySubjects = subjectsTaughtOnDay.get(day)!
        const tomorrow = getTomorrow(day)
        const tomorrowSubjects = subjectsTaughtOnDay.get(tomorrow)!
        const tomorrowWeakSubjects = tomorrowSubjects.filter((s) => weakSubjectsSet.has(s))

        // Get candidates for each category, preferring to alternate cognitive type (lastSubjectType)
        const getBestFromCategory = (candidatesFilter: (s: SubjectInfo) => boolean, checkScheduled = true): string | null => {
          let list = subjects.filter(
            (s) =>
              s.name !== lastSubject &&
              s.subjectType !== lastSubjectType &&
              candidatesFilter(s) &&
              (!checkScheduled || !subjectsScheduledToday.has(s.name)) &&
              (budgetTracker.get(s.name)?.remainingMinutes || 0) > 0
          )
          if (list.length === 0) {
            // Relax cognitive alternation
            list = subjects.filter(
              (s) =>
                s.name !== lastSubject &&
                candidatesFilter(s) &&
                (!checkScheduled || !subjectsScheduledToday.has(s.name)) &&
                (budgetTracker.get(s.name)?.remainingMinutes || 0) > 0
            )
          }
          if (list.length === 0) return null

          // Sort by coefficient descending, then alphabetically
          list.sort((a, b) => b.coefficient - a.coefficient || a.name.localeCompare(b.name))
          return list[0].name
        }

        // Consolidation (only subjects not yet scheduled today)
        selectedSubject = getBestFromCategory((s) => todaySubjects.includes(s.name), true)

        // Anticipation (only subjects not yet scheduled today)
        if (!selectedSubject) {
          selectedSubject = getBestFromCategory((s) => tomorrowWeakSubjects.includes(s.name), true)
        }

        // General revision
        if (!selectedSubject) {
          let list = subjects.filter(
            (s) =>
              s.name !== lastSubject &&
              s.subjectType !== lastSubjectType &&
              !subjectsScheduledToday.has(s.name) &&
              (budgetTracker.get(s.name)?.remainingMinutes || 0) > 0
          )
          if (list.length === 0) {
            list = subjects.filter(
              (s) =>
                s.name !== lastSubject &&
                !subjectsScheduledToday.has(s.name) &&
                (budgetTracker.get(s.name)?.remainingMinutes || 0) > 0
            )
          }
          if (list.length === 0) {
            // Relax scheduled today check
            list = subjects.filter(
              (s) => s.name !== lastSubject && (budgetTracker.get(s.name)?.remainingMinutes || 0) > 0
            )
          }
          if (list.length > 0) {
            list.sort((a, b) => priorities.get(b.name)! - priorities.get(a.name)! || a.name.localeCompare(b.name))
            selectedSubject = list[0].name
          }
        }

        // Fallbacks
        if (!selectedSubject) {
          const anyWithBudget = subjects.filter((s) => (budgetTracker.get(s.name)?.remainingMinutes || 0) > 0)
          if (anyWithBudget.length > 0) {
            selectedSubject = anyWithBudget[0].name
          } else {
            const anySubject = [...subjects].sort(
              (a, b) => priorities.get(b.name)! - priorities.get(a.name)! || a.name.localeCompare(b.name)
            )
            selectedSubject = anySubject[0]?.name || null
          }
        }
      }

      if (selectedSubject) {
        const subjInfo = subjects.find((s) => s.name === selectedSubject)!
        lastSubject = selectedSubject
        lastSubjectType = subjInfo.subjectType
        subjectsScheduledToday.add(selectedSubject)

        // Update budget tracker
        const tracker = budgetTracker.get(selectedSubject)!
        tracker.usedMinutes += slot.duration
        tracker.remainingMinutes = Math.max(0, tracker.totalBudget - tracker.usedMinutes)

        // Choose session type: td vs review based on remaining ratios
        const budget = budgets.get(selectedSubject) || { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }
        let sessionType: "td" | "review" = "review"
        const remainingTd = budget.tdMinutes - tracker.tdUsed
        const remainingReview = budget.reviewMinutes - tracker.reviewUsed

        if (remainingTd >= remainingReview) {
          sessionType = "td"
          tracker.tdUsed += slot.duration
        } else {
          sessionType = "review"
          tracker.reviewUsed += slot.duration
        }

        sessions.push({
          day_of_week: day,
          start_time: formatTime(slot.start),
          end_time: formatTime(slot.end),
          subject: selectedSubject,
          session_type: sessionType,
          pedagogical_note: "",
        })
      }
    }
  }

  // Sort sessions chronologically by day order, then start time
  const dayOrder: Record<string, number> = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  }

  return sessions.sort((a, b) => {
    const dayDiff = dayOrder[a.day_of_week] - dayOrder[b.day_of_week]
    if (dayDiff !== 0) return dayDiff
    return parseTime(a.start_time) - parseTime(b.start_time)
  })
}
