import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"
import { BaseService } from "./base.service"

export type Historique = Database["public"]["Tables"]["historique"]["Row"]

export class HistoriqueService extends BaseService<Historique> {
  constructor(supabase: SupabaseClient) {
    super(supabase, "historique")
  }

  async logCompletion(payload: {
    user_id: string
    session_id?: string | null
    subject: string
    session_type: Database["public"]["Enums"]["session_type"]
    duration_minutes?: number | null
    self_rating?: number | null
    notes?: string | null
  }): Promise<Historique> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        user_id: payload.user_id,
        session_id: payload.session_id || null,
        subject: payload.subject,
        session_type: payload.session_type,
        duration_minutes: payload.duration_minutes || null,
        self_rating: payload.self_rating || null,
        notes: payload.notes || null,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Erreur lors de l'enregistrement de l'historique: ${error.message}`)
    }

    return data as Historique
  }

  async getWeeklyStats(userId: string): Promise<{
    totalMinutes: number
    sessionCount: number
    averageRating: number | null
    completedBySubject: Record<string, number>
    recentLogs: Historique[]
  }> {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString()

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .gte("completed_at", sevenDaysAgoStr)
      .order("completed_at", { ascending: false })

    if (error) {
      throw new Error(`Erreur lors du calcul des statistiques hebdomadaires: ${error.message}`)
    }

    const logs = data as Historique[]
    let totalMinutes = 0
    let ratingsSum = 0
    let ratedCount = 0
    const completedBySubject: Record<string, number> = {}

    logs.forEach((log) => {
      totalMinutes += log.duration_minutes || 0
      if (log.self_rating) {
        ratingsSum += log.self_rating
        ratedCount++
      }
      completedBySubject[log.subject] = (completedBySubject[log.subject] || 0) + 1
    })

    return {
      totalMinutes,
      sessionCount: logs.length,
      averageRating: ratedCount > 0 ? parseFloat((ratingsSum / ratedCount).toFixed(1)) : null,
      completedBySubject,
      recentLogs: logs,
    }
  }

  /**
   * For each subject, return the number of days since the last completed revision.
   * Used by computePriority() for urgency scoring.
   */
  async getDaysSinceLastRevisionBySubject(userId: string): Promise<Map<string, number>> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("subject, completed_at")
      .eq("user_id", userId)

    if (error) {
      throw new Error(`Erreur lors de la récupération de l'historique par matière: ${error.message}`)
    }

    const result = new Map<string, number>()
    const now = new Date()
    const latestBySubject = new Map<string, Date>()

    for (const row of data || []) {
      if (!row.subject || !row.completed_at) continue
      const date = new Date(row.completed_at)
      const existing = latestBySubject.get(row.subject)
      if (!existing || date > existing) {
        latestBySubject.set(row.subject, date)
      }
    }

    for (const [subject, lastDate] of latestBySubject.entries()) {
      const diffTime = Math.abs(now.getTime() - lastDate.getTime())
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
      result.set(subject, diffDays)
    }

    return result
  }
}
