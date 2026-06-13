import { describe, it, expect } from "vitest"
import {
  DAYS,
  DAY_LABELS,
  FULL_DAY_LABELS,
  BEDTIME_OPTIONS,
  TYPE_LABELS,
  parseCoefficientTable,
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

  describe("parseCoefficientTable", () => {
    it("parses coefficient tables correctly into code keys", () => {
      const table = `- MATH: 8\n- PC: 8\n- SVT: 3`
      const map = parseCoefficientTable(table)
      expect(map.get("MATH")).toBe(8)
      expect(map.get("PC")).toBe(8)
      expect(map.get("SVT")).toBe(3)
      expect(map.get("UNKNOWN")).toBeUndefined()
    })

    it("handles empty input", () => {
      const map = parseCoefficientTable("")
      expect(map.size).toBe(0)
    })
  })
})

