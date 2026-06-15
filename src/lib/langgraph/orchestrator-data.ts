import { SupabaseClient } from "@supabase/supabase-js"
import { CoefficientService } from "@/src/services/coefficient.service"
import { logger } from "@/src/lib/logger"

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

export async function fetchCoefficientTable(
  supabase: SupabaseClient,
  classId: string | null | undefined
): Promise<string> {
  try {
    if (classId) {
      const cachedStr = getCachedCoefficients(classId)
      if (cachedStr) return cachedStr
      const coeffService = new CoefficientService(supabase)
      const coeffs = await coeffService.getByClassId(classId)
      if (coeffs.length > 0) {
        const table = coeffs.map((c) => `- ${c.subject.toUpperCase()}: ${c.coefficient}`).join("\n")
        setCachedCoefficients(classId, table)
        return table
      }
    }
    const fallbackClassName = "Terminale S1"
    const cachedStr = getCachedCoefficients(fallbackClassName)
    if (cachedStr) return cachedStr
    const coeffService = new CoefficientService(supabase)
    const coeffs = await coeffService.getCoefficientsByClassName(fallbackClassName)
    if (coeffs.length > 0) {
      const table = coeffs.map((c) => `- ${c.subject.toUpperCase()}: ${c.coefficient}`).join("\n")
      setCachedCoefficients(fallbackClassName, table)
      return table
    }
    return ""
  } catch (err) {
    logger.error({ err }, "Failed to fetch coefficients for AI workflow")
    return ""
  }
}
