import { describe, it, expect } from "vitest"
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
  it("enforces bedtime, subtracts blocked slots, and processes school days vs weekends", () => {
    const freeSlots = buildFreeSlots(TEST_TIMETABLE, "22:00", TEST_BLOCKED)

    // 1. Bedtime check: no slot ends after 22:00
    for (const slot of freeSlots) {
      const [h, m] = slot.end.split(":").map(Number)
      expect(h * 60 + m).toBeLessThanOrEqual(22 * 60)
    }

    // 2. Blocked slots check: Tuesday 18:00-20:00 must not overlap with any Tuesday free slot
    const tuesdaySlots = freeSlots.filter(s => s.day === "tuesday")
    for (const slot of tuesdaySlots) {
      const start = slot.start
      const end = slot.end
      // Verify no overlap with 18:00-20:00
      expect(start >= "20:00" || end <= "18:00").toBe(true)
    }

    // 3. Saturday and Sunday checks
    const saturdaySlots = freeSlots.filter(s => s.day === "saturday")
    expect(saturdaySlots.length).toBeGreaterThan(0)
    
    const sundaySlots = freeSlots.filter(s => s.day === "sunday")
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
    const saturdaySlots = freeSlots.filter(s => s.day === "saturday")
    
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
    const wednesdaySlots = freeSlots.filter(s => s.day === "wednesday")
    
    // Wednesday has classes:
    // Slot 1: 08:00 - 10:00
    // Slot 2: 12:20 - 13:50
    // Gap: 10:00 to 12:20. Duration: 140 min.
    // Evening: 13:50 + 30 min (14:20) to 22:00.
    // Expected gap window: 10:00 + 30 min (10:30) to 12:20. Duration: 110 min.
    const gapSlot = wednesdaySlots.find(s => s.start === "10:30" && s.end === "12:20")
    expect(gapSlot).toBeDefined()
    expect(gapSlot?.durationMinutes).toBe(110)

    const eveningSlot = wednesdaySlots.find(s => s.start === "14:20" && s.end === "22:00")
    expect(eveningSlot).toBeDefined()
    expect(eveningSlot?.durationMinutes).toBe(460)
  })

  it("filters out free slots shorter than minSessionMinutes", () => {
    // Say we have a blocked slot that leaves only 15 minutes of a raw window.
    // Monday evening starts at 17:00 (last class 16:30 + 30min) to bedtime 22:00.
    // If we block Monday 17:15 to 22:00, the remaining window is 17:00 to 17:15 (15 mins), which is < minSessionMinutes (25).
    // It should be discarded.
    const blocked: BlockedSlot[] = [
      { id: "1", day: "monday", startTime: "17:15", endTime: "22:00", reason: "Something" }
    ]
    const freeSlots = buildFreeSlots(TEST_TIMETABLE, "22:00", blocked)
    const mondaySlots = freeSlots.filter(s => s.day === "monday")
    
    // Check that we don't have a 17:00-17:15 slot
    const shortSlot = mondaySlots.find(s => s.start === "17:00")
    expect(shortSlot).toBeUndefined()
  })
})
