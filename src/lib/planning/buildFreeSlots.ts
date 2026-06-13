import { ExtractedTimetable, BlockedSlot, FreeSlot } from "@/src/types/planning.types"
import { PLANNING_CONFIG } from "./planningConfig"

export function parseTime(s: string): number {
  const [h, m] = s.split(":").map(Number)
  return h * 60 + m
}

export function formatTime(m: number): string {
  const h = Math.floor(m / 60)
  const mins = m % 60
  return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

/**
 * Extract all available time windows for revision in the week.
 * Respects bedtime, blocked slots, mandatory breaks, lunch breaks.
 */
export function buildFreeSlots(
  timetable: ExtractedTimetable,
  bedtime: string,
  blockedSlots: BlockedSlot[]
): FreeSlot[] {
  const bedtimeMinutes = parseTime(bedtime)
  const freeSlots: FreeSlot[] = []

  // Group blocked slots by day, distinguishing user-defined (buffered) from internal (no buffer)
  type InternalBlock = { start: number; end: number; buffered: boolean }
  const blockedByDay = new Map<string, InternalBlock[]>()
  for (const day of DAYS_OF_WEEK) {
    blockedByDay.set(day, [])
  }

  for (const block of blockedSlots) {
    const day = block.day.toLowerCase()
    if (blockedByDay.has(day)) {
      blockedByDay.get(day)!.push({
        start: parseTime(block.startTime),
        end: parseTime(block.endTime),
        buffered: true, // user-defined slots get the post-block buffer
      })
    }
  }

  // Iterate over each day of the week
  for (const day of DAYS_OF_WEEK) {
    const daySlots = timetable.days?.find((d) => d.day.toLowerCase() === day)?.slots || []
    const isSchoolDay = daySlots.length > 0 && day !== "saturday" && day !== "sunday"

    const rawWindows: { start: number; end: number }[] = []

    if (isSchoolDay) {
      // Sort slots chronologically
      const sortedSlots = [...daySlots].sort((a, b) => parseTime(a.start) - parseTime(b.start))

      // Identify the last morning class (ending before lunchBreakMorningCutoff)
      const lunchCutoff = parseTime(PLANNING_CONFIG.schoolDayLunchBreakMorningCutoff)
      const lunchBreakEnd = parseTime(PLANNING_CONFIG.schoolDayLunchBreakEnd)
      const lastMorningSlot = [...sortedSlots].filter((s) => parseTime(s.end) <= lunchCutoff).pop()

      // If any morning class ends before 13:30, block lunch until 14:00
      if (lastMorningSlot && parseTime(lastMorningSlot.end) >= parseTime("11:00")) {
        blockedByDay.get(day)!.push({
          start: parseTime(lastMorningSlot.end),
          end: lunchBreakEnd,
          buffered: false, // internal block, no post-buffer needed
        })
      }

      // Evening window: last class end + 30 min -> bedtime
      const lastClass = sortedSlots[sortedSlots.length - 1]
      const lastClassEnd = parseTime(lastClass.end)
      const eveningStart = lastClassEnd + PLANNING_CONFIG.mandatoryBreakAfterClassMinutes

      if (eveningStart < bedtimeMinutes) {
        rawWindows.push({ start: eveningStart, end: bedtimeMinutes })
      }

      // Intra-day gaps >= 2 hours (120 minutes)
      for (let i = 0; i < sortedSlots.length - 1; i++) {
        const currentEnd = parseTime(sortedSlots[i].end)
        const nextStart = parseTime(sortedSlots[i + 1].start)
        const gap = nextStart - currentEnd
        if (gap >= 120) {
          const gapStart = currentEnd + PLANNING_CONFIG.mandatoryBreakAfterClassMinutes
          if (gapStart < nextStart) {
            rawWindows.push({ start: gapStart, end: nextStart })
          }
        }
      }
    } else {
      // Free weekday or weekend day
      let startTimeStr: string = PLANNING_CONFIG.freeDayStartTime
      if (day === "sunday") {
        startTimeStr = PLANNING_CONFIG.sundayStartTime
      }
      const dayStart = parseTime(startTimeStr)

      if (dayStart < bedtimeMinutes) {
        rawWindows.push({ start: dayStart, end: bedtimeMinutes })
      }

      // Carve out lunch break as an implicit blocked slot
      const lunchStart = parseTime(PLANNING_CONFIG.lunchBreakStart)
      const lunchEnd = parseTime(PLANNING_CONFIG.lunchBreakEnd)
      blockedByDay.get(day)!.push({ start: lunchStart, end: lunchEnd, buffered: false })
    }

    // Subtract blocked slots from raw windows
    const dayBlocked = blockedByDay.get(day)!
    let currentWindows = [...rawWindows]

    for (const block of dayBlocked) {
      const buffer = block.buffered ? PLANNING_CONFIG.bufferAfterBlockedSlotMinutes : 0
      const nextWindows: { start: number; end: number }[] = []
      for (const win of currentWindows) {
        if (block.end <= win.start || block.start >= win.end) {
          // No overlap
          nextWindows.push(win)
        } else {
          // Overlap: split/cut window
          if (win.start < block.start) {
            nextWindows.push({ start: win.start, end: block.start })
          }
          if (win.end > block.end) {
            // Add buffer after blocked slot ends
            const resumeAt = block.end + buffer
            if (resumeAt < win.end) {
              nextWindows.push({ start: resumeAt, end: win.end })
            }
          }
        }
      }
      currentWindows = nextWindows
    }

    // Filter windows that are shorter than minSessionMinutes and format them
    for (const win of currentWindows) {
      const duration = win.end - win.start
      if (duration >= PLANNING_CONFIG.minSessionMinutes) {
        freeSlots.push({
          day,
          start: formatTime(win.start),
          end: formatTime(win.end),
          durationMinutes: duration,
        })
      }
    }
  }

  return freeSlots
}
