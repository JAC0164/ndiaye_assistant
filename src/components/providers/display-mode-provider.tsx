"use client"

import React, { createContext, useContext, useCallback, useSyncExternalStore } from "react"

export type DisplayMode = "standard" | "overlay"

interface DisplayModeContextType {
  mode: DisplayMode
  setDisplayMode: (mode: DisplayMode) => void
  toggleDisplayMode: () => void
}

const DisplayModeContext = createContext<DisplayModeContextType | undefined>(undefined)

const STORAGE_KEY = "ndiaye-display-mode"

function getSnapshot(): DisplayMode {
  if (typeof window !== "undefined") {
    const savedMode = localStorage.getItem(STORAGE_KEY) as DisplayMode | null
    if (savedMode === "standard" || savedMode === "overlay") return savedMode
  }
  return "standard"
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  return () => window.removeEventListener("storage", callback)
}

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const mode: DisplayMode = useSyncExternalStore(subscribe, getSnapshot, () => "standard")

  const setDisplayMode = useCallback((newMode: DisplayMode) => {
    localStorage.setItem(STORAGE_KEY, newMode)
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: newMode }))
  }, [])

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode(mode === "standard" ? "overlay" : "standard")
  }, [mode, setDisplayMode])

  return (
    <DisplayModeContext.Provider value={{ mode, setDisplayMode, toggleDisplayMode }}>
      {children}
    </DisplayModeContext.Provider>
  )
}

export function useDisplayMode() {
  const context = useContext(DisplayModeContext)
  if (context === undefined) {
    throw new Error("useDisplayMode must be used within a DisplayModeProvider")
  }
  return context
}
