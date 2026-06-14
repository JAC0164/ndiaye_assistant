"use client"

import React from "react"
import { useDisplayMode } from "@/src/components/providers/display-mode-provider"

export default function DisplayModeToggle() {
  const { mode, toggleDisplayMode } = useDisplayMode()

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-400">Mode d&apos;affichage:</span>
      <button
        onClick={toggleDisplayMode}
        className={`relative flex items-center h-6 w-12 rounded-full p-0.5 transition-colors duration-300 focus:outline-none ${
          mode === "overlay" ? "bg-emerald-500" : "bg-zinc-700"
        }`}
        title={`Basculez en mode ${mode === "standard" ? "Superposition (Overlay)" : "Plein écran (Standard)"}`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
            mode === "overlay" ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-xs font-medium text-zinc-300 select-none">
        {mode === "overlay" ? "Overlay" : "Standard"}
      </span>
    </div>
  )
}
