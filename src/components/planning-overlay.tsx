"use client"

import React, { useEffect, useState, useRef, useCallback } from "react"
import { useDisplayMode } from "@/src/components/providers/DisplayModeProvider"
import { createClient } from "@/src/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import type { DbSession as Session } from "@/src/services/session.service"

export default function PlanningOverlay() {
  const { mode, setDisplayMode } = useDisplayMode()
  const [user, setUser] = useState<User | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(true)
  const [position, setPosition] = useState({ x: -20, y: -20 }) // Offset from bottom-right
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [elementStart, setElementStart] = useState({ x: 0, y: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const fetchTodaySessions = useCallback(
    async (userId: string) => {
      try {
        setLoading(true)
        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        const todayEnglish = days[new Date().getDay()]

        const { data, error } = await supabase
          .from("sessions")
          .select("*")
          .eq("user_id", userId)
          .eq("day_of_week", todayEnglish)
          .order("start_time", { ascending: true })

        if (error) throw error
        setSessions(data || [])
      } catch (err) {
        console.error("Error fetching daily sessions for overlay:", err)
      } finally {
        setLoading(false)
      }
    },
    [supabase]
  )

  // Track authentication state
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        fetchTodaySessions(user.id)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      if (session?.user) {
        fetchTodaySessions(session.user.id)
      } else {
        setSessions([])
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refetch when planning page revalidates or saving is complete (simple custom event or short polling fallback)
  useEffect(() => {
    const handleSessionsSaved = () => {
      if (user) {
        fetchTodaySessions(user.id)
      }
    }
    window.addEventListener("ndiaye-sessions-saved", handleSessionsSaved)
    return () => window.removeEventListener("ndiaye-sessions-saved", handleSessionsSaved)
  }, [user, fetchTodaySessions])

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag on handle or header, not inside content
    if ((e.target as HTMLElement).closest(".no-drag")) return

    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })

    // Get actual current element position
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      // Position is relative to viewport bottom-right
      const xOffset = window.innerWidth - rect.right
      const yOffset = window.innerHeight - rect.bottom
      setElementStart({ x: xOffset, y: yOffset })
    }

    e.preventDefault()
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      const deltaX = e.clientX - dragStart.x
      const deltaY = e.clientY - dragStart.y

      // We are positioned from bottom-right, so move right decreases x, move down decreases y
      const newX = Math.max(10, elementStart.x - deltaX)
      const newY = Math.max(10, elementStart.y - deltaY)

      setPosition({
        x: newX,
        y: newY,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, dragStart, elementStart])

  // Get current day name in French
  const getFrenchDay = () => {
    const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
    return days[new Date().getDay()]
  }

  // Format time (HH:MM:SS -> HHhMM)
  const formatTime = (timeStr: string) => {
    const parts = timeStr.split(":")
    return `${parts[0]}h${parts[1]}`
  }

  // Get badge color based on session type
  const getSessionTypeStyles = (type: string) => {
    switch (type) {
      case "td":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20"
      case "review":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      case "break":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20"
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
    }
  }

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "td":
        return "TD"
      case "review":
        return "Révision"
      case "break":
        return "Pause"
      default:
        return type
    }
  }

  // If we are in standard mode, we don't display the overlay dashboard.
  if (mode !== "overlay" || !user) return null

  // Collapsed View (floating badge trigger)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed z-50 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-zinc-900/90 text-emerald-400 shadow-2xl backdrop-blur-md transition-all hover:scale-105 hover:bg-zinc-800 hover:text-emerald-300"
        style={{
          right: `${position.x}px`,
          bottom: `${position.y}px`,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {sessions.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
            {sessions.filter((s) => s.session_type !== "break").length}
          </span>
        )}
      </button>
    )
  }

  // Expanded View
  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      className={`fixed z-50 w-80 rounded-2xl border border-zinc-800 bg-zinc-950/85 text-zinc-100 shadow-2xl backdrop-blur-xl transition-shadow select-none ${
        isDragging ? "cursor-grabbing shadow-emerald-500/10 shadow-3xl" : "cursor-grab"
      }`}
      style={{
        right: `${position.x}px`,
        bottom: `${position.y}px`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold tracking-wide text-zinc-400">{getFrenchDay()}</span>
        </div>
        <div className="no-drag flex items-center gap-1.5">
          {/* Go to Full Screen */}
          <button
            onClick={() => {
              setDisplayMode("standard")
              window.location.href = "/planning"
            }}
            title="Plein écran (Standard)"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
              />
            </svg>
          </button>
          {/* Minimize */}
          <button
            onClick={() => setIsOpen(false)}
            title="Minimiser"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="no-drag max-h-[360px] overflow-y-auto px-4 py-3 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
            <svg className="animate-spin h-5 w-5 text-emerald-500 mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-xs">Chargement du planning...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-zinc-500">Aucune séance prévue aujourd&apos;hui !</p>
            <button
              onClick={() => {
                setDisplayMode("standard")
                window.location.href = "/planning"
              }}
              className="mt-3 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-all"
            >
              Créer mon planning
            </button>
          </div>
        ) : (
          <div className="relative border-l border-zinc-800 ml-2 pl-4 space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="relative group transition-all duration-200">
                {/* Timeline node */}
                <div
                  className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-zinc-950 ${
                    session.session_type === "break" ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200 group-hover:text-emerald-400 transition-colors">
                      {session.subject}
                    </h4>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {formatTime(session.start_time)} - {formatTime(session.end_time)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold tracking-wider uppercase ${getSessionTypeStyles(session.session_type)}`}
                  >
                    {getSessionTypeLabel(session.session_type)}
                  </span>
                </div>

                {session.pedagogical_note && (
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-400 bg-zinc-900/50 rounded p-1.5 border border-zinc-800/40">
                    {session.pedagogical_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="no-drag flex items-center justify-between border-t border-zinc-800 px-4 py-2 bg-zinc-950/40 rounded-b-2xl">
        <span className="text-[9px] text-zinc-500">Ndiaye AI Assistant V1</span>
        <button
          onClick={() => {
            setDisplayMode("standard")
            window.location.href = "/planning"
          }}
          className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-all hover:underline"
        >
          Ouvrir l&apos;éditeur
        </button>
      </div>
    </div>
  )
}
