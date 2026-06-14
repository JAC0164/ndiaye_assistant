export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

export const SUNDAY_FIRST_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

export type DayOfWeek = (typeof DAYS)[number]

export const DAY_LABELS: Record<string, string> = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mer",
  thursday: "Jeu",
  friday: "Ven",
  saturday: "Sam",
  sunday: "Dim",
}

export const FULL_DAY_LABELS: Record<string, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
}

export const ENGLISH_DAYS: Record<string, string> = {
  dimanche: "sunday",
  lundi: "monday",
  mardi: "tuesday",
  mercredi: "wednesday",
  jeudi: "thursday",
  vendredi: "friday",
  samedi: "saturday",
}

export const DAY_ORDER: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
}

export const BEDTIME_OPTIONS = ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"]

export const TYPE_LABELS: Record<string, string> = {
  td: "TD",
  review: "Révision",
  break: "Pause",
}

export function parseCoefficientTable(tableStr: string): Map<string, number> {
  const map = new Map<string, number>()
  if (!tableStr) return map
  const lines = tableStr.split("\n")
  for (const line of lines) {
    const match = line.match(/^\s*-\s*(.+?)\s*:\s*(\d+)\s*$/)
    if (match) {
      const subject = match[1].trim().toUpperCase()
      const coeff = parseInt(match[2], 10)
      map.set(subject, coeff)
    }
  }
  return map
}
