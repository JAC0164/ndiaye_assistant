import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"
import { BaseService } from "./base.service"

export type Session = Database["public"]["Tables"]["sessions"]["Row"]

export class SemaineService extends BaseService<Session> {
  constructor(supabase: SupabaseClient) {
    super(supabase, "sessions")
  }

  async getWeeklyTemplate(userId: string): Promise<Session[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)

    if (error) {
      throw new Error(`Erreur lors de la récupération du planning de la semaine: ${error.message}`)
    }

    // Sort order for days of week
    const daysOrder = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 7,
    }

    // Sort client-side by day and start time
    return (data as Session[]).sort((a, b) => {
      const dayDiff = daysOrder[a.day_of_week] - daysOrder[b.day_of_week]
      if (dayDiff !== 0) return dayDiff
      return a.start_time.localeCompare(b.start_time)
    })
  }

  async getSessionsForDay(userId: string, dayOfWeek: Database["public"]["Enums"]["day_of_week"]): Promise<Session[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("day_of_week", dayOfWeek)
      .order("start_time", { ascending: true })

    if (error) {
      throw new Error(`Erreur lors de la récupération des séances du ${dayOfWeek}: ${error.message}`)
    }

    return data as Session[]
  }
}
