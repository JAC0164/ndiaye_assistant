import { describe, it, expect, vi, beforeEach } from "vitest"

const mockMandatoryBreakAfterClassMinutes = vi.hoisted(() => ({ current: 30 }))

vi.mock("../../../src/lib/planning/planningConfig", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/planning/planningConfig")>(
    "../../../src/lib/planning/planningConfig"
  )
  return {
    ...actual,
    PLANNING_CONFIG: {
      ...actual.PLANNING_CONFIG,
      get mandatoryBreakAfterClassMinutes() {
        return mockMandatoryBreakAfterClassMinutes.current
      },
    },
  }
})

import { buildFreeSlots } from "../../../src/lib/planning/buildFreeSlots"
import { ExtractedTimetable, BlockedSlot } from "../../../src/types/planning.types"

const TEST_TIMETABLE: ExtractedTimetable = {
  filiere: "L2",
  days: [
    {
      day: "monday",
      slots: [
        { start: "08:00", end: "09:30", subject: "Développement Personnel", coefficient: null, subject_type: "other" },
        { start: "09:40", end: "11:10", subject: "MATH", coefficient: 4, subject_type: "scientific" },
        { start: "11:20", end: "12:50", subject: "FR", coefficient: 5, subject_type: "literary" },
        { start: "15:00", end: "16:30", subject: "ESP", coefficient: 2, subject_type: "language" },
      ],
    },
    {
      day: "tuesday",
      slots: [
        { start: "08:00", end: "09:30", subject: "PC", coefficient: 3, subject_type: "scientific" },
        { start: "09:40", end: "11:10", subject: "SVT", coefficient: 2, subject_type: "scientific" },
        { start: "11:20", end: "12:50", subject: "ANG", coefficient: 3, subject_type: "language" },
        { start: "15:00", end: "16:30", subject: "HG", coefficient: 3, subject_type: "literary" },
      ],
    },
    {
      day: "wednesday",
      slots: [
        { start: "08:00", end: "10:00", subject: "FR", coefficient: 5, subject_type: "literary" },
        // gap of 2h20 between 10:00 and 12:20 (140 mins)
        { start: "12:20", end: "13:50", subject: "MATH", coefficient: 4, subject_type: "scientific" },
      ],
    },
  ],
}

const TEST_BLOCKED: BlockedSlot[] = [
  { id: "1", day: "tuesday", startTime: "18:00", endTime: "20:00", reason: "Cours du soir" },
  { id: "2", day: "thursday", startTime: "18:00", endTime: "20:00", reason: "Cours du soir" },
]

describe("buildFreeSlots", () => {
  beforeEach(() => {
    mockMandatoryBreakAfterClassMinutes.current = 30
  })
  it("enforces bedtime, subtracts blocked slots, and processes school days vs weekends", () => {
    const freeSlots = buildFreeSlots(TEST_TIMETABLE, "22:00", TEST_BLOCKED)

    // 1. Bedtime check: no slot ends after 22:00
    for (const slot of freeSlots) {
      const [h, m] = slot.end.split(":").map(Number)
      expect(h * 60 + m).toBeLessThanOrEqual(22 * 60)
    }

    // 2. Blocked slots check: Tuesday 18:00-20:00 must not overlap with any Tuesday free slot
    //    AND the buffer of 20 minutes must be respected (no slot starting before 20:20)
    const tuesdaySlots = freeSlots.filter((s) => s.day === "tuesday")
    for (const slot of tuesdaySlots) {
      const startMin = parseInt(slot.start.split(":")[0]) * 60 + parseInt(slot.start.split(":")[1])
      const endMin = parseInt(slot.end.split(":")[0]) * 60 + parseInt(slot.end.split(":")[1])
      // No overlap with 18:00-20:00 block
      expect(startMin >= 20 * 60 + 20 || endMin <= 18 * 60).toBe(true)
    }

    // 3. Saturday and Sunday checks
    const saturdaySlots = freeSlots.filter((s) => s.day === "saturday")
    expect(saturdaySlots.length).toBeGreaterThan(0)

    const sundaySlots = freeSlots.filter((s) => s.day === "sunday")
    expect(sundaySlots.length).toBeGreaterThan(0)

    // Saturday start time check (9:00)
    expect(saturdaySlots[0].start).toBe("09:00")
    // Sunday start time check (10:00)
    expect(sundaySlots[0].start).toBe("10:00")
  })

  it("carves out lunch break on free days", () => {
    // Saturday is a free day. Lunch break is 12:30 to 14:00.
    // Starting at 09:00, bedtime 22:00.
    // Expected windows: 09:00-12:30 (210 mins) and 14:00-22:00 (480 mins)
    const freeSlots = buildFreeSlots({ filiere: "L2", days: [] }, "22:00", [])
    const saturdaySlots = freeSlots.filter((s) => s.day === "saturday")

    expect(saturdaySlots).toHaveLength(2)
    expect(saturdaySlots[0].start).toBe("09:00")
    expect(saturdaySlots[0].end).toBe("12:30")
    expect(saturdaySlots[0].durationMinutes).toBe(210)
    expect(saturdaySlots[1].start).toBe("14:00")
    expect(saturdaySlots[1].end).toBe("22:00")
    expect(saturdaySlots[1].durationMinutes).toBe(480)
  })

  it("extracts school day intra-day gaps >= 2 hours", () => {
    const freeSlots = buildFreeSlots(TEST_TIMETABLE, "22:00", [])
    const wednesdaySlots = freeSlots.filter((s) => s.day === "wednesday")

    // Wednesday has classes:
    // Slot 1: 08:00 - 10:00
    // Slot 2: 12:20 - 13:50
    // Gap: 10:00 to 12:20. Duration: 140 min.
    // Evening: 13:50 + 30 min (14:20) to 22:00.
    // Expected gap window: 10:00 + 30 min (10:30) to 12:20. Duration: 110 min.
    const gapSlot = wednesdaySlots.find((s) => s.start === "10:30" && s.end === "12:20")
    expect(gapSlot).toBeDefined()
    expect(gapSlot?.durationMinutes).toBe(110)

    const eveningSlot = wednesdaySlots.find((s) => s.start === "14:20" && s.end === "22:00")
    expect(eveningSlot).toBeDefined()
    expect(eveningSlot?.durationMinutes).toBe(460)
  })

  it("filters out free slots shorter than minSessionMinutes", () => {
    // Say we have a blocked slot that leaves only 15 minutes of a raw window.
    // Monday evening starts at 17:00 (last class 16:30 + 30min) to bedtime 22:00.
    // If we block Monday 17:15 to 22:00, the remaining window is 17:00 to 17:15 (15 mins), which is < minSessionMinutes (25).
    // It should be discarded.
    const blocked: BlockedSlot[] = [
      { id: "1", day: "monday", startTime: "17:15", endTime: "22:00", reason: "Something" },
    ]
    const freeSlots = buildFreeSlots(TEST_TIMETABLE, "22:00", blocked)
    const mondaySlots = freeSlots.filter((s) => s.day === "monday")

    // Check that we don't have a 17:00-17:15 slot
    const shortSlot = mondaySlots.find((s) => s.start === "17:00")
    expect(shortSlot).toBeUndefined()
  })

  it("adds 20-minute buffer after blocked slot ends", () => {
    // Tuesday: cours du soir 18:00-20:00. Classes end at 16:30 so evening starts at 17:00.
    // After subtraction: 17:00-18:00 (60 mins) and 20:20-22:00 (100 mins), NOT 20:00-22:00.
    const freeSlots = buildFreeSlots(TEST_TIMETABLE, "22:00", TEST_BLOCKED)
    const tuesdaySlots = freeSlots.filter((s) => s.day === "tuesday")

    // Should not have a slot starting exactly at 20:00
    const noBufferSlot = tuesdaySlots.find((s) => s.start === "20:00")
    expect(noBufferSlot).toBeUndefined()

    // Should have a slot starting at 20:20
    const bufferedSlot = tuesdaySlots.find((s) => s.start === "20:20")
    expect(bufferedSlot).toBeDefined()
    expect(bufferedSlot?.end).toBe("22:00")
    expect(bufferedSlot?.durationMinutes).toBe(100)
  })

  it("skips blocked slots with invalid day names (line 38 false branch)", () => {
    const blocked: BlockedSlot[] = [
      { id: "1", day: "unknown", startTime: "10:00", endTime: "11:00", reason: "Invalid day" },
    ]
    const freeSlots = buildFreeSlots({ filiere: "L2", days: [] }, "22:00", blocked)
    const saturdaySlots = freeSlots.filter((s) => s.day === "saturday")
    expect(saturdaySlots.length).toBeGreaterThan(0)
  })

  it("does not add evening window when last class ends too late for bedtime (line 77 false branch)", () => {
    const timetable: ExtractedTimetable = {
      filiere: "L2",
      days: [
        {
          day: "monday",
          slots: [
            { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" },
            { start: "18:00", end: "21:05", subject: "FR", coefficient: 5, subject_type: "literary" },
          ],
        },
      ],
    }
    const freeSlots = buildFreeSlots(timetable, "21:30", [])
    const mondaySlots = freeSlots.filter((s) => s.day === "monday")
    // Last class ends at 21:05. eveningStart = 21:05 + 30min = 21:35.
    // Bedtime is 21:30, so 21:35 < 21:30 is false → no evening window
    const eveningSlots = mondaySlots.filter((s) => s.start >= "21:35")
    expect(eveningSlots).toHaveLength(0)
  })

  it("skips free day window when start time is after or equal to bedtime (line 101 false branch)", () => {
    const freeSlots = buildFreeSlots({ filiere: "L2", days: [] }, "08:00", [])
    const saturdaySlots = freeSlots.filter((s) => s.day === "saturday")
    expect(saturdaySlots).toHaveLength(0)
  })

  it("does not push buffer segment when buffer extends beyond window end (line 130 false branch)", () => {
    // Saturday free day 09:00-20:00, lunch break 12:30-14:00, blocked 19:35-19:50
    const blocked: BlockedSlot[] = [
      { id: "1", day: "saturday", startTime: "19:35", endTime: "19:50", reason: "Late block" },
    ]
    const freeSlots = buildFreeSlots({ filiere: "L2", days: [] }, "20:00", blocked)
    const saturdaySlots = freeSlots.filter((s) => s.day === "saturday")
    // Expected: 09:00-12:30 and 14:00-19:35
    // 20:10-20:00 is not added because resumeAt (19:50+20min=20:10) >= win.end (20:00)
    expect(saturdaySlots).toHaveLength(2)
    expect(saturdaySlots[0].start).toBe("09:00")
    expect(saturdaySlots[0].end).toBe("12:30")
    expect(saturdaySlots[1].start).toBe("14:00")
    expect(saturdaySlots[1].end).toBe("19:35")
  })

  it("skips intra-day gap window when mandatory break exceeds gap duration (line 88 false branch)", () => {
    mockMandatoryBreakAfterClassMinutes.current = 150
    // Gap of exactly 120 min between 10:00 and 12:00
    // mandatoryBreakAfterClassMinutes = 150, so gap (120) is not > 150 => no window added
    const timetable = {
      filiere: "L2",
      days: [
        {
          day: "wednesday",
          slots: [
            { start: "08:00", end: "10:00", subject: "FR", coefficient: 5, subject_type: "literary" },
            { start: "12:00", end: "13:30", subject: "MATH", coefficient: 4, subject_type: "scientific" },
          ],
        },
      ],
    }
    const freeSlots = buildFreeSlots(timetable, "22:00", [])
    const wednesdaySlots = freeSlots.filter((s) => s.day === "wednesday")
    const gapSlot = wednesdaySlots.find((s) => s.start === "10:30")
    expect(gapSlot).toBeUndefined()
  })

  it("enforces lunch break on school days when morning class ends before 13:30", () => {
    // Monday and Tuesday have last morning class ending at 12:50
    // The lunch break should block 12:50-14:00 on those days
    // Monday intra-day gap: 12:50 to 15:00 = 130 min >= 120 min threshold
    // But with lunch block (12:50-14:00) carved from this gap:
    //   raw gap window: 12:50 + 30 min = 13:20 to 15:00
    //   lunch block (12:50-14:00) overlaps, so after subtraction:
    //   available gap after lunch: 14:00 + 20 min buffer = 14:20 to 15:00 (40 min >= 25 min)
    const freeSlots = buildFreeSlots(TEST_TIMETABLE, "22:00", [])
    const mondaySlots = freeSlots.filter((s) => s.day === "monday")

    // No Monday slot should start between 12:50 and 14:00
    for (const slot of mondaySlots) {
      const startMin = parseInt(slot.start.split(":")[0]) * 60 + parseInt(slot.start.split(":")[1])
      // If start is after 12:50, it must be at or after 14:00 (lunch break end)
      if (startMin > 12 * 60 + 50) {
        expect(startMin).toBeGreaterThanOrEqual(14 * 60)
      }
    }

    // Same check for Tuesday
    const tuesdaySlots = freeSlots.filter((s) => s.day === "tuesday")
    for (const slot of tuesdaySlots) {
      const startMin = parseInt(slot.start.split(":")[0]) * 60 + parseInt(slot.start.split(":")[1])
      if (startMin > 12 * 60 + 50) {
        expect(startMin).toBeGreaterThanOrEqual(14 * 60)
      }
    }
  })
})
