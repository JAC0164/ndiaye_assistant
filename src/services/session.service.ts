import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"
import { GeneratedSeance } from "@/src/lib/langgraph/state"
import { BaseService } from "./base.service"

export type DbSession = Database["public"]["Tables"]["sessions"]["Row"]

export type Seance = GeneratedSeance & {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

const daysOrder: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
}

export class SessionService extends BaseService<DbSession> {
  constructor(supabase: SupabaseClient) {
    super(supabase, "sessions")
  }

  async getWeeklyTemplate(userId: string): Promise<DbSession[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true })

    if (error) {
      throw new Error(`Erreur lors de la récupération du planning: ${error.message}`)
    }

    return data as DbSession[]
  }

  async getSessionsForDay(userId: string, dayOfWeek: Database["public"]["Enums"]["day_of_week"]): Promise<DbSession[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("day_of_week", dayOfWeek)
      .order("start_time", { ascending: true })

    if (error) {
      throw new Error(`Erreur lors de la récupération des séances du ${dayOfWeek}: ${error.message}`)
    }

    return data as DbSession[]
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
    const { data, error } = await this.supabase.rpc(
      "replace_user_sessions",
      {
        p_user_id: userId,
        p_sessions: JSON.parse(JSON.stringify(sessions)),
      }
    )

    if (error) {
      throw new Error(
        `Erreur lors du remplacement du planning: ${error.message}`
      )
    }

    return (data ?? []) as Seance[]
  }
}
