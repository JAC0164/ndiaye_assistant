import { SupabaseClient } from "@supabase/supabase-js"

import { createPlanningGraph } from "@/src/lib/langgraph/graph"
import {
  GeneratedSeance,
  PlanningGraphState,
} from "@/src/lib/langgraph/state"
import type { ModelOverrides } from "@/src/lib/langgraph/providers"

import { BaseService } from "./base.service"

export type Seance = GeneratedSeance & {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

export type PlanningWorkflowResult = PlanningGraphState & {
  insertedSeances: Seance[]
}

export class SeanceService extends BaseService<Seance> {
  constructor(supabase: SupabaseClient) {
    super(supabase, "sessions")
  }

  async createMany(userId: string, sessions: GeneratedSeance[]): Promise<Seance[]> {
    if (sessions.length === 0) {
      return []
    }

    const payload = sessions.map((session) => ({
      ...session,
      user_id: userId,
    }))

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(payload)
      .select()

    if (error) {
      throw new Error(
        `Erreur lors de la création des séances: ${error.message}`
      )
    }

    return data as Seance[]
  }

  async generateFullPlanningWorkflow(
    userId: string,
    imageBuffer: Buffer,
    onboardingData: unknown,
    imageMimeType = "image/jpeg",
    modelOverrides?: ModelOverrides
  ): Promise<PlanningWorkflowResult> {
    const graph = createPlanningGraph(modelOverrides)
    const state = await graph.invoke({
      timetableImage: imageBuffer,
      timetableImageMimeType: imageMimeType,
      onboardingData,
    })

    if (!state.isValidTimetable) {
      return {
        ...state,
        insertedSeances: [],
      }
    }

    const insertedSeances = await this.createMany(
      userId,
      state.generatedPlanning
    )

    return {
      ...state,
      insertedSeances,
    }
  }
}
