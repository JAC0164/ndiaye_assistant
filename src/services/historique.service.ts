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

  async saveFeedback(
    sessionId: string,
    userId: string,
    feedback: { completed: boolean; ressenti?: number; duree_reelle_min?: number }
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = {
      completed: feedback.completed,
    }
    if (feedback.ressenti !== undefined) updatePayload.ressenti = feedback.ressenti
    if (feedback.duree_reelle_min !== undefined) updatePayload.duree_reelle_min = feedback.duree_reelle_min

    const { error } = await this.supabase
      .from(this.tableName)
      .update(updatePayload)
      .eq("id", sessionId)
      .eq("user_id", userId)

    if (error) {
      throw new Error(`Erreur lors de l'enregistrement du feedback: ${error.message}`)
    }
  }

  async getRessentBySubject(userId: string): Promise<Map<string, number>> {
    const fourWeeksAgo = new Date()
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
    const cutoff = fourWeeksAgo.toISOString()

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("subject, ressenti, completed_at")
      .eq("user_id", userId)
      .eq("completed", true)
      .not("ressenti", "is", null)
      .gte("completed_at", cutoff)

    if (error) {
      throw new Error(`Erreur lors de la récupération des ressentis: ${error.message}`)
    }

    const grouped = new Map<string, { weightedSum: number; weightSum: number }>()

    for (const row of data || []) {
      if (!row.subject || row.ressenti === null) continue
      const daysAgo = Math.floor((Date.now() - new Date(row.completed_at).getTime()) / (1000 * 60 * 60 * 24))
      let weight: number
      if (daysAgo <= 7) weight = 4
      else if (daysAgo <= 14) weight = 3
      else if (daysAgo <= 21) weight = 2
      else weight = 1

      const entry = grouped.get(row.subject) || { weightedSum: 0, weightSum: 0 }
      entry.weightedSum += row.ressenti * weight
      entry.weightSum += weight
      grouped.set(row.subject, entry)
    }

    const result = new Map<string, number>()
    for (const [subject, { weightedSum, weightSum }] of grouped) {
      result.set(subject, parseFloat((weightedSum / weightSum).toFixed(2)))
    }

    return result
  }

  async getDureeReelleBySubject(userId: string): Promise<Map<string, number>> {
    const fourWeeksAgo = new Date()
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
    const cutoff = fourWeeksAgo.toISOString()

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("subject, duree_reelle_min")
      .eq("user_id", userId)
      .eq("completed", true)
      .not("duree_reelle_min", "is", null)
      .gte("completed_at", cutoff)

    if (error) {
      throw new Error(`Erreur lors de la récupération des durées réelles: ${error.message}`)
    }

    const sumBySubject = new Map<string, { total: number; count: number }>()

    for (const row of data || []) {
      if (!row.subject || row.duree_reelle_min === null) continue
      const entry = sumBySubject.get(row.subject) || { total: 0, count: 0 }
      entry.total += row.duree_reelle_min
      entry.count++
      sumBySubject.set(row.subject, entry)
    }

    const result = new Map<string, number>()
    for (const [subject, { total, count }] of sumBySubject) {
      result.set(subject, Math.round(total / count))
    }

    return result
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
