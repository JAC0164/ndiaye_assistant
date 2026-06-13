import { describe, it, expect } from "vitest"
import { extractSubjects } from "../../../src/lib/planning/extractSubjects"
import { ExtractedTimetable } from "../../../src/types/planning.types"

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
        { start: "08:00", end: "09:30", subject: "FR", coefficient: 5, subject_type: "literary" },
        { start: "09:40", end: "11:10", subject: "MATH", coefficient: 4, subject_type: "scientific" },
        { start: "11:20", end: "12:50", subject: "ECO", coefficient: 2, subject_type: "literary" },
      ],
    },
    {
      day: "thursday",
      slots: [
        { start: "08:00", end: "09:30", subject: "ANG", coefficient: 3, subject_type: "language" },
        { start: "09:40", end: "11:10", subject: "HG", coefficient: 3, subject_type: "literary" },
        { start: "11:20", end: "12:50", subject: "ESP", coefficient: 2, subject_type: "language" },
        { start: "15:00", end: "16:30", subject: "ECO", coefficient: 2, subject_type: "literary" },
      ],
    },
    {
      day: "friday",
      slots: [
        { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" },
        { start: "09:40", end: "11:10", subject: "FR", coefficient: 5, subject_type: "literary" },
        { start: "11:20", end: "12:50", subject: "SVT", coefficient: 2, subject_type: "scientific" },
        { start: "15:00", end: "16:30", subject: "PC", coefficient: 3, subject_type: "scientific" },
      ],
    },
  ],
}

describe("extractSubjects", () => {
  it("extracts unique revisable subjects and excludes Développement Personnel", () => {
    const subjects = extractSubjects(TEST_TIMETABLE)
    // 8 unique subjects expected: FR, MATH, ANG, HG, PC, SVT, ESP, ECO.
    // Développement Personnel is excluded.
    expect(subjects).toHaveLength(8)
    const names = subjects.map((s) => s.name)
    expect(names).not.toContain("Développement Personnel")
    expect(names).toContain("FR")
    expect(names).toContain("MATH")
    expect(names).toContain("PC")
  })

  it("handles fallback coefficient when null", () => {
    const timetableWithNull: ExtractedTimetable = {
      filiere: "L2",
      days: [
        {
          day: "monday",
          slots: [
            { start: "08:00", end: "09:30", subject: "Maths Spéciales", coefficient: null, subject_type: "scientific" },
          ],
        },
      ],
    }
    const subjects = extractSubjects(timetableWithNull)
    expect(subjects).toHaveLength(1)
    expect(subjects[0].name).toBe("MATHS SPÉCIALES")
    expect(subjects[0].coefficient).toBe(1)
  })

  it("tracks daysPresent correctly", () => {
    const subjects = extractSubjects(TEST_TIMETABLE)
    const francais = subjects.find((s) => s.name === "FR")
    expect(francais).toBeDefined()
    expect(francais?.daysPresent).toEqual(expect.arrayContaining(["monday", "wednesday", "friday"]))
    expect(francais?.daysPresent).toHaveLength(3)

    const eco = subjects.find((s) => s.name === "ECO")
    expect(eco).toBeDefined()
    expect(eco?.daysPresent).toEqual(expect.arrayContaining(["wednesday", "thursday"]))
    expect(eco?.daysPresent).toHaveLength(2)
  })

  it("sorts subjects by coefficient descending, then alphabetically", () => {
    const subjects = extractSubjects(TEST_TIMETABLE)
    // Coeffs:
    // FR: 5
    // MATH: 4
    // ANG: 3, HG: 3, PC: 3
    // ECO: 2, ESP: 2, SVT: 2
    expect(subjects[0].name).toBe("FR")
    expect(subjects[0].coefficient).toBe(5)
    expect(subjects[1].name).toBe("MATH")
    expect(subjects[1].coefficient).toBe(4)

    // 3 with coeff 3: ANG, HG, PC (alphabetical sorting expected)
    const coeff3 = subjects.slice(2, 5).map((s) => s.name)
    expect(coeff3).toEqual(["ANG", "HG", "PC"])

    // 3 with coeff 2: ECO, ESP, SVT
    const coeff2 = subjects.slice(5, 8).map((s) => s.name)
    expect(coeff2).toEqual(["ECO", "ESP", "SVT"])
  })
})
