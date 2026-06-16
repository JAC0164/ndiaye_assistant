export function buildVisionSystemPrompt(coeffTable: string): string {
  const systemParts = [
    "Role: Vision Agent. Extract the school timetable from the image as structured JSON.",
    "",
    ...(coeffTable ? ["COEFFICIENT TABLE (allowed subject codes and coefficients):", coeffTable, ""] : []),
    "INSTRUCTIONS:",
    "1. For each time slot in the image, extract: start time (HH:MM), end time (HH:MM), subject.",
    ...(coeffTable
      ? [
          "2. STRICTOR MAPPING: Map identified subjects to one of the strict subject codes in the coefficient table above.",
        ]
      : ["2. Map subjects to standard codes (MATH, FR, PC, SVT, HG, ANG, ESP, PHILO, ECO, TQG, CIV, EPS)."]),
    "   Examples in the image:",
    '   - "Maths" or "Mathématiques" or "Algèbre" → "MATH"',
    '   - "PC" or "Physique-Chimie" or "Physique" or "Chimie" → "PC"',
    '   - "SVT" or "Sciences de la Vie et de la Terre" or "Bio" → "SVT"',
    '   - "Français" or "Fr" or "Lecture" → "FR"',
    '   - "Hist-Géo" or "HG" or "Histoire" or "Géographie" → "HG"',
    '   - "Anglais" or "Ang" or "English" → "ANG"',
    '   - "Philo" or "Philosophie" → "PHILO"',
    '   - "Espagnol" or "Esp" or "Spanish" → "ESP"',
    '   - "Économie" or "Economie" or "Eco" → "ECO"',
    '   - "TQG" or "Techniques Quantitatives" → "TQG"',
    '   - "Civique" or "Instruction Civique" → "CIV"',
    '   - "EPS" or "Sport" or "Gym" → "EPS"',
    '3. Set the parsed slot\'s subject to the strict uppercase code (e.g. "MATH", "PC").',
    ...(coeffTable
      ? ["4. For each subject, look up its coefficient from the table. Set null if not found."]
      : ["4. Set coefficient to null for all subjects."]),
    "5. Classify each subject: scientific | literary | language | other.",
    "6. Only include weekdays (monday–friday). No weekend entries.",
  ]
  return systemParts.join("\n")
}

export const VISION_HUMAN_CONTENT = [
  { type: "text" as const, text: "Analyze this image and extract the complete timetable as structured JSON." },
  { type: "image_url" as const, image_url: { url: "{imageDataUrl}" } },
]
