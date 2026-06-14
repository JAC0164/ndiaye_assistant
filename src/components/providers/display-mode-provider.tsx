"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

export type DisplayMode = "standard" | "overlay"

interface DisplayModeContextType {
  mode: DisplayMode
  setDisplayMode: (mode: DisplayMode) => void
  toggleDisplayMode: () => void
}

const DisplayModeContext = createContext<DisplayModeContextType | undefined>(undefined)

function getInitialMode(): DisplayMode {
  if (typeof window !== "undefined") {
    const savedMode = localStorage.getItem("ndiaye-display-mode") as DisplayMode
    if (savedMode === "standard" || savedMode === "overlay") {
      return savedMode
    }
  }
  return "standard"
}

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<DisplayMode>(getInitialMode)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
