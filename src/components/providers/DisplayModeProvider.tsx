"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

export type DisplayMode = "standard" | "overlay"

interface DisplayModeContextType {
  mode: DisplayMode
  setDisplayMode: (mode: DisplayMode) => void
  toggleDisplayMode: () => void
}

const DisplayModeContext = createContext<DisplayModeContextType | undefined>(undefined)

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<DisplayMode>("standard")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Read display mode preference from localStorage on mount
    const savedMode = localStorage.getItem("ndiaye-display-mode") as DisplayMode
    if (savedMode === "standard" || savedMode === "overlay") {
      setModeState(savedMode)
    }
    setMounted(true)
  }, [])

  const setDisplayMode = (newMode: DisplayMode) => {
    setModeState(newMode)
    localStorage.setItem("ndiaye-display-mode", newMode)
  }

  const toggleDisplayMode = () => {
    const newMode = mode === "standard" ? "overlay" : "standard"
    setDisplayMode(newMode)
  }

  // Prevent SSR flash of wrong state by only rendering children once mounted
  return (
    <DisplayModeContext.Provider value={{ mode: mounted ? mode : "standard", setDisplayMode, toggleDisplayMode }}>
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
