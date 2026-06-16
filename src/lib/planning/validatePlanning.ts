import { GeneratedSeance } from "@/src/lib/langgraph/state"
import { BlockedSlot, SubjectBudget, SubjectInfo, ValidationResult } from "@/src/types/planning.types"

/**
 * Post-LLM hard constraint validator (minimal pass-through template).
 */
export function validatePlanning(
  planning: GeneratedSeance[],
  bedtime: string,
  blockedSlots: BlockedSlot[],
  options?: {
    budgets?: Map<string, SubjectBudget>
    weakSubjects?: string[]
    allSubjects?: SubjectInfo[]
  }
): ValidationResult {
  return {
    validatedPlanning: planning,
    wasRepaired: false,
    errors: [],
    warnings: [],
    removedSessions: [],
  }
}
