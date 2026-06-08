export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

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

export const SERIES_SUBJECTS: Record<string, string[]> = {
  S1: ["Mathématiques", "Physique-Chimie", "SVT", "Français", "Anglais", "Histoire-Géo", "Philosophie"],
  S2: ["Mathématiques", "Physique-Chimie", "SVT", "Français", "Anglais", "Histoire-Géo", "Philosophie"],
  L1: ["Français", "Philosophie", "Anglais", "Histoire-Géo", "Mathématiques", "Espagnol"],
  L2: ["Français", "Philosophie", "Anglais", "Histoire-Géo", "Mathématiques", "Espagnol"],
  "L'": ["Français", "Philosophie", "Anglais", "Histoire-Géo", "Mathématiques", "Espagnol"]
}

export const SERIES_INFO = [
  { value: "S1", label: "S1", desc: "Maths & PC", focus: "Maths, PC, SVT" },
  { value: "S2", label: "S2", desc: "Expérimentale", focus: "Maths, PC, SVT" },
  { value: "L1", label: "L1", desc: "Langues/Lettres", focus: "Philo, Fr, Anglais" },
  { value: "L2", label: "L2", desc: "Sciences Humaines", focus: "Philo, Fr, Hist-Géo" },
  { value: "L'", label: "L'", desc: "Langues Vivantes", focus: "Philo, Fr, Langues" },
]

export const BEDTIME_OPTIONS = ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"]

export const TYPE_LABELS: Record<string, string> = {
  td: "TD",
  review: "Révision",
  break: "Pause",
}
