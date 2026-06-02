import { SupabaseClient } from "@supabase/supabase-js"

export abstract class BaseService<T> {
  protected readonly supabase: SupabaseClient
  protected readonly tableName: string

  constructor(supabase: SupabaseClient, tableName: string) {
    this.supabase = supabase
    this.tableName = tableName
  }

  async getAll(): Promise<T[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")

    if (error) {
      throw new Error(
        `Erreur lors de la récupération des données: ${error.message}`
      )
    }

    return data as T[]
  }

  async getById(id: string): Promise<T | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("id", id)
      .single()

    if (error) {
      throw new Error(
        `Erreur lors de la récupération de l'élément: ${error.message}`
      )
    }

    return data as T | null
  }

  async create(payload: Partial<T>): Promise<T> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(payload)
      .select()
      .single()

    if (error) {
      throw new Error(`Erreur lors de la création: ${error.message}`)
    }

    return data as T
  }

  async update(id: string, payload: Partial<T>): Promise<T> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(payload)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw new Error(`Erreur lors de la mise à jour: ${error.message}`)
    }

    return data as T
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("id", id)

    if (error) {
      throw new Error(`Erreur lors de la suppression: ${error.message}`)
    }
  }
}
