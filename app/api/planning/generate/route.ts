import { NextRequest, NextResponse } from "next/server"

import { withAuth } from "@/src/lib/api-middleware"
import { logger } from "@/src/lib/logger"
import { runPlanningWorkflow } from "@/src/lib/langgraph/orchestrator"
import { jsonError, parseJSONField, fileToBuffer, withTimeout, REQUEST_TIMEOUT } from "@/src/lib/route-utils"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

  let imageUpload
  let onboardingData: unknown

  try {
    const formData = await request.formData()
    imageUpload = await fileToBuffer(formData.get("timetableImage"))
    onboardingData = parseJSONField(formData.get("onboardingData")) ?? {}
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : "Requête invalide.")
  }

  try {
    const result = await withTimeout(
      runPlanningWorkflow(supabase, user.id, imageUpload.buffer, onboardingData, imageUpload.mimeType),
      REQUEST_TIMEOUT
    )

    if (!result.isValidTimetable) {
      return NextResponse.json(
        {
          isValidTimetable: false,
          validationErrorMessage: result.validationErrorMessage,
          generatedPlanning: [],
        },
        { status: 422, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      )
    }

    return NextResponse.json(
      {
        isValidTimetable: true,
        extractedTimetable: result.extractedTimetable,
        timetableSummary: result.timetableSummary,
        studentProfileContext: result.studentProfileContext,
        generatedPlanning: result.generatedPlanning,
        planningValidation: result.planningValidation,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    )
  } catch (error) {
    logger.error({ error }, "Planning generation error")
    return jsonError(500, "Erreur lors de la génération du planning. Veuillez réessayer.")
  }
}
