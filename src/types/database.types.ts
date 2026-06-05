export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      school_levels: {
        Row: {
          id: string
          name: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          sort_order: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      series: {
        Row: {
          id: string
          name: string
          description: string | null
          level_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          level_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          level_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      classes: {
        Row: {
          id: string
          name: string
          level_id: string
          series_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          level_id: string
          series_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          level_id?: string
          series_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      coefficients: {
        Row: {
          id: string
          class_id: string
          subject: string
          coefficient: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          class_id: string
          subject: string
          coefficient: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          class_id?: string
          subject?: string
          coefficient?: number
          created_at?: string
          updated_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          start_time: string
          end_time: string
          subject: string
          session_type: Database["public"]["Enums"]["session_type"]
          pedagogical_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          start_time: string
          end_time: string
          subject: string
          session_type?: Database["public"]["Enums"]["session_type"]
          pedagogical_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          start_time?: string
          end_time?: string
          subject?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          pedagogical_note?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string
          avatar_url: string | null
          birthday: string | null
          confidence_level: number | null
          class_id: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string
          display_name?: string
          avatar_url?: string | null
          birthday?: string | null
          confidence_level?: number | null
          class_id?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          avatar_url?: string | null
          birthday?: string | null
          confidence_level?: number | null
          class_id?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      echeances: {
        Row: {
          id: string
          user_id: string
          subject: string
          title: string
          description: string | null
          due_date: string
          echeance_type: "devoir" | "examen" | "composition" | "projet"
          is_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subject: string
          title: string
          description?: string | null
          due_date: string
          echeance_type: "devoir" | "examen" | "composition" | "projet"
          is_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subject?: string
          title?: string
          description?: string | null
          due_date?: string
          echeance_type?: "devoir" | "examen" | "composition" | "projet"
          is_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      historique: {
        Row: {
          id: string
          user_id: string
          session_id: string | null
          subject: string
          session_type: Database["public"]["Enums"]["session_type"]
          completed_at: string
          duration_minutes: number | null
          self_rating: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          session_id?: string | null
          subject: string
          session_type: Database["public"]["Enums"]["session_type"]
          completed_at?: string
          duration_minutes?: number | null
          self_rating?: number | null
          notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string | null
          subject?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          completed_at?: string
          duration_minutes?: number | null
          self_rating?: number | null
          notes?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      day_of_week:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
      session_type: "course" | "td" | "tp" | "review" | "break"
    }
  }
}
