import { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/src/lib/logger"

export type QueryOptions = {
  limit?: number
  offset?: number
  orderBy?: { column: string; ascending: boolean }
}

export abstract class BaseService<T extends Record<string, unknown>> {
  protected readonly supabase: SupabaseClient
  protected readonly tableName: string

  constructor(supabase: SupabaseClient, tableName: string) {
    this.supabase = supabase
    this.tableName = tableName
  }

  async getAll(userId?: string, options?: QueryOptions): Promise<T[]> {
    let query = this.supabase.from(this.tableName).select("*")

    if (userId) {
      query = query.eq("user_id", userId)
    }

    if (options?.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending,
      })
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
    }

    const { data, error } = await query

    if (error) {
      logger.error({ table: this.tableName, supabaseError: error.message }, "BaseService getAll failed")
      throw new Error("Erreur lors de la récupération des données.")
    }

    return data as T[]
  }

  async getById(id: string): Promise<T | null> {
    const { data, error } = await this.supabase.from(this.tableName).select("*").eq("id", id).single()

    if (error) {
      logger.error({ table: this.tableName, id, supabaseError: error.message }, "BaseService getById failed")
      throw new Error("Erreur lors de la récupération de l'élément.")
    }

    return data as T | null
  }

  async create(payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.from(this.tableName).insert(payload).select().single()

    if (error) {
      logger.error({ table: this.tableName, supabaseError: error.message }, "BaseService create failed")
      throw new Error("Erreur lors de la création.")
    }

    return data as T
  }

  async update(id: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.from(this.tableName).update(payload).eq("id", id).select().single()

    if (error) {
      logger.error({ table: this.tableName, id, supabaseError: error.message }, "BaseService update failed")
      throw new Error("Erreur lors de la mise à jour.")
    }

    return data as T
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from(this.tableName).delete().eq("id", id)

    if (error) {
      logger.error({ table: this.tableName, id, supabaseError: error.message }, "BaseService delete failed")
      throw new Error("Erreur lors de la suppression.")
    }
  }
}
