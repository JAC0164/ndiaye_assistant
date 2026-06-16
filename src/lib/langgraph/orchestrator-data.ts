import { logger } from "@/src/lib/logger"
import { CoefficientService } from "@/src/services/coefficient.service"
import { SupabaseClient } from "@supabase/supabase-js"

const COEFFICIENTS_CACHE_TTL = Number(process.env.COEFFICIENTS_CACHE_TTL ?? 3_600_000)
const COEFFICIENTS_CACHE_MAX = 50
const coefficientsCache = new Map<string, { data: string; expiry: number; order: number }>()
let cacheOrderCounter = 0

function getCachedCoefficients(className: string): string | null {
  const entry = coefficientsCache.get(className)
  if (entry && Date.now() < entry.expiry) return entry.data
  coefficientsCache.delete(className)
  return null
}

function setCachedCoefficients(className: string, data: string): void {
  if (coefficientsCache.size >= COEFFICIENTS_CACHE_MAX) {
    let oldestKey: string | null = null
    let oldestOrder = Infinity
    for (const [k, v] of coefficientsCache) {
      if (v.order < oldestOrder) {
        oldestOrder = v.order
        oldestKey = k
      }
    }
    coefficientsCache.delete(oldestKey!)
  }
  coefficientsCache.set(className, {
    data,
    expiry: Date.now() + COEFFICIENTS_CACHE_TTL,
    order: ++cacheOrderCounter,
  })
}

export type CoefficientTableResult = {
  coefficientTable: string
  classSeriesName: string
}

export async function fetchCoefficientTable(
  supabase: SupabaseClient,
  classId: string | null | undefined
): Promise<CoefficientTableResult> {
  const result: CoefficientTableResult = { coefficientTable: "", classSeriesName: "" }

  try {
    if (classId) {
      const cachedStr = getCachedCoefficients(classId)
      if (cachedStr) {
        result.coefficientTable = cachedStr
        // Series name is not cached separately; refetch on cache miss only
      } else {
        const coeffService = new CoefficientService(supabase)
        const coeffs = await coeffService.getByClassId(classId)
        if (coeffs.length > 0) {
          result.coefficientTable = coeffs.map((c) => `- ${c.subject.toUpperCase()}: ${c.coefficient}`).join("\n")
          setCachedCoefficients(classId, result.coefficientTable)
        }
      }

      // Fetch the series name from classes -> series
      const { data: classRow } = await supabase.from("classes").select("series_id").eq("id", classId).maybeSingle()

      if (classRow?.series_id) {
        const { data: serie } = await supabase.from("series").select("name").eq("id", classRow.series_id).maybeSingle()

        result.classSeriesName = serie?.name?.toUpperCase() || ""
      }
    }

    // Fallback if no coefficient table was loaded
    if (!result.coefficientTable) {
      const fallbackClassName = "Terminale S1"
      const cachedStr = getCachedCoefficients(fallbackClassName)
      if (cachedStr) {
        result.coefficientTable = cachedStr
      } else {
        const coeffService = new CoefficientService(supabase)
        const coeffs = await coeffService.getCoefficientsByClassName(fallbackClassName)
        if (coeffs.length > 0) {
          result.coefficientTable = coeffs.map((c) => `- ${c.subject.toUpperCase()}: ${c.coefficient}`).join("\n")
          setCachedCoefficients(fallbackClassName, result.coefficientTable)
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch coefficients for AI workflow")
  }

  return result
}
