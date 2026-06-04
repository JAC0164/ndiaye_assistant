import { SupabaseClient } from "@supabase/supabase-js"

import { GeneratedSeance } from "@/src/lib/langgraph/state"

import { BaseService } from "./base.service"

export type Seance = GeneratedSeance & {
  id: string
  user_id: string
  created_at: string
  updated_at: string
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

  async replaceAll(userId: string, sessions: GeneratedSeance[]): Promise<Seance[]> {
    const { error: deleteError } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("user_id", userId)

    if (deleteError) {
      throw new Error(
        `Erreur lors de la réinitialisation du planning: ${deleteError.message}`
      )
    }

    return this.createMany(userId, sessions)
  }
}
