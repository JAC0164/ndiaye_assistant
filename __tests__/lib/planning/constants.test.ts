import { describe, it, expect } from "vitest"
import {
  DAYS,
  DAY_LABELS,
  FULL_DAY_LABELS,
  SERIES_SUBJECTS,
  SERIES_INFO,
  BEDTIME_OPTIONS,
  TYPE_LABELS,
} from "../../../src/lib/planning/constants"

describe("planning constants", () => {
  describe("DAYS", () => {
    it("has exactly 7 entries", () => {
      expect(DAYS).toHaveLength(7)
    })

    it("contains all days from monday through sunday in order", () => {
      expect(DAYS).toEqual(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    })
  })

  describe("DAY_LABELS", () => {
    it("has exactly 7 entries", () => {
      expect(Object.keys(DAY_LABELS)).toHaveLength(7)
    })

    it("maps each day to correct French short label", () => {
      expect(DAY_LABELS).toEqual({
        monday: "Lun",
        tuesday: "Mar",
        wednesday: "Mer",
        thursday: "Jeu",
        friday: "Ven",
        saturday: "Sam",
        sunday: "Dim",
      })
    })
  })

  describe("FULL_DAY_LABELS", () => {
    it("has exactly 7 entries", () => {
      expect(Object.keys(FULL_DAY_LABELS)).toHaveLength(7)
    })

    it("maps each day to correct French full label", () => {
      expect(FULL_DAY_LABELS).toEqual({
        monday: "Lundi",
        tuesday: "Mardi",
        wednesday: "Mercredi",
        thursday: "Jeudi",
        friday: "Vendredi",
        saturday: "Samedi",
        sunday: "Dimanche",
      })
    })
  })

  describe("SERIES_SUBJECTS", () => {
    it("has entries for S1, S2, L1, L2, and L'", () => {
      expect(Object.keys(SERIES_SUBJECTS)).toEqual(["S1", "S2", "L1", "L2", "L'"])
    })

    it("S1 has Mathématiques as first subject", () => {
      expect(SERIES_SUBJECTS.S1[0]).toBe("Mathématiques")
    })

    it("S1 has 7 subjects", () => {
      expect(SERIES_SUBJECTS.S1).toHaveLength(7)
    })

    it("S2 has 7 subjects", () => {
      expect(SERIES_SUBJECTS.S2).toHaveLength(7)
    })

    it("L1 has 6 subjects", () => {
      expect(SERIES_SUBJECTS.L1).toHaveLength(6)
    })

    it("L2 has 6 subjects", () => {
      expect(SERIES_SUBJECTS.L2).toHaveLength(6)
    })

    it("L' has 6 subjects", () => {
      expect(SERIES_SUBJECTS["L'"]).toHaveLength(6)
    })

    it("S1 and S2 have identical subject lists", () => {
      expect(SERIES_SUBJECTS.S1).toEqual(SERIES_SUBJECTS.S2)
    })

    it("L1, L2, and L' have identical subject lists", () => {
      expect(SERIES_SUBJECTS.L1).toEqual(SERIES_SUBJECTS.L2)
      expect(SERIES_SUBJECTS.L1).toEqual(SERIES_SUBJECTS["L'"])
    })

    it("S-series includes SVT while L-series does not", () => {
      expect(SERIES_SUBJECTS.S1).toContain("SVT")
      expect(SERIES_SUBJECTS.L1).not.toContain("SVT")
    })

    it("L-series includes Espagnol while S-series does not", () => {
      expect(SERIES_SUBJECTS.L1).toContain("Espagnol")
      expect(SERIES_SUBJECTS.S1).not.toContain("Espagnol")
    })

    it("all subjects are strings", () => {
      for (const subjects of Object.values(SERIES_SUBJECTS)) {
        for (const subject of subjects) {
          expect(typeof subject).toBe("string")
        }
      }
    })
  })

  describe("SERIES_INFO", () => {
    it("has 5 entries", () => {
      expect(SERIES_INFO).toHaveLength(5)
    })

    it("S1 has correct label and focus", () => {
      expect(SERIES_INFO[0]).toEqual({
        value: "S1",
        label: "S1",
        desc: "Maths & PC",
        focus: "Maths, PC, SVT",
      })
    })

    it("S2 has correct label and focus", () => {
      expect(SERIES_INFO[1]).toEqual({
        value: "S2",
        label: "S2",
        desc: "Expérimentale",
        focus: "Maths, PC, SVT",
      })
    })

    it("L1 has correct label and focus", () => {
      expect(SERIES_INFO[2]).toEqual({
        value: "L1",
        label: "L1",
        desc: "Langues/Lettres",
        focus: "Philo, Fr, Anglais",
      })
    })

    it("L2 has correct label and focus", () => {
      expect(SERIES_INFO[3]).toEqual({
        value: "L2",
        label: "L2",
        desc: "Sciences Humaines",
        focus: "Philo, Fr, Hist-Géo",
      })
    })

    it("L' has correct label and focus", () => {
      expect(SERIES_INFO[4]).toEqual({
        value: "L'",
        label: "L'",
        desc: "Langues Vivantes",
        focus: "Philo, Fr, Langues",
      })
    })

    it("every entry has value, label, desc, and focus as strings", () => {
      for (const info of SERIES_INFO) {
        expect(typeof info.value).toBe("string")
        expect(typeof info.label).toBe("string")
        expect(typeof info.desc).toBe("string")
        expect(typeof info.focus).toBe("string")
      }
    })
  })

  describe("BEDTIME_OPTIONS", () => {
    it("has 8 entries", () => {
      expect(BEDTIME_OPTIONS).toHaveLength(8)
    })

    it("starts at 20:00 and ends at 23:30", () => {
      expect(BEDTIME_OPTIONS[0]).toBe("20:00")
      expect(BEDTIME_OPTIONS[7]).toBe("23:30")
    })

    it("increments in 30-minute steps", () => {
      const expected = ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"]
      expect(BEDTIME_OPTIONS).toEqual(expected)
    })
  })

  describe("TYPE_LABELS", () => {
    it("has 3 entries", () => {
      expect(Object.keys(TYPE_LABELS)).toHaveLength(3)
    })

    it("maps each type to correct French label", () => {
      expect(TYPE_LABELS).toEqual({
        td: "TD",
        review: "Révision",
        break: "Pause",
      })
    })
  })
})
