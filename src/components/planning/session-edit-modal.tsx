"use client"

import { useState } from "react"
import type { GeneratedSeance } from "@/src/lib/langgraph/state"

interface SessionEditModalProps {
  isOpen: boolean
  session: GeneratedSeance | null
  onClose: () => void
  onSave: (session: GeneratedSeance) => void
  onDelete: () => void
}

export default function SessionEditModal({ isOpen, session, onClose, onSave, onDelete }: SessionEditModalProps) {
  const [editingSession, setEditingSession] = useState<GeneratedSeance | null>(() => (session ? { ...session } : null))

  if (!isOpen || !editingSession) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-900 bg-zinc-955 bg-zinc-950 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4">
          <h3 className="text-base font-bold uppercase tracking-wider text-white">Modifier la séance</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-sm font-semibold cursor-pointer">
            Fermer
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Subject */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Matière</label>
            <input
              type="text"
              value={editingSession.subject}
              onChange={(e) => setEditingSession({ ...editingSession, subject: e.target.value })}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm text-white focus:outline-none focus:border-zinc-700"
            />
          </div>

          {/* Type select */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Type de séance</label>
            <select
              value={editingSession.session_type}
              onChange={(e) =>
                setEditingSession({
                  ...editingSession,
                  session_type: e.target.value as GeneratedSeance["session_type"],
                })
              }
              className="mt-1.5 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm text-white focus:outline-none"
            >
              <option value="review">Révision (Review)</option>
              <option value="td">TD</option>
              <option value="break">Pause (Break)</option>
            </select>
          </div>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Heure Début</label>
              <input
                type="text"
                value={editingSession.start_time}
                placeholder="HH:mm"
                onChange={(e) => setEditingSession({ ...editingSession, start_time: e.target.value })}
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Heure Fin</label>
              <input
                type="text"
                value={editingSession.end_time}
                placeholder="HH:mm"
                onChange={(e) => setEditingSession({ ...editingSession, end_time: e.target.value })}
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Pedagogical notes */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Note pédagogique</label>
            <textarea
              value={editingSession.pedagogical_note || ""}
              rows={3}
              onChange={(e) => setEditingSession({ ...editingSession, pedagogical_note: e.target.value })}
              className="mt-1.5 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm text-white focus:outline-none focus:border-zinc-700"
            />
          </div>

          {/* Action triggers */}
          <div className="flex items-center justify-between border-t border-zinc-900 pt-4 mt-3">
            <button
              onClick={onDelete}
              className="rounded-lg bg-red-955 bg-red-950/40 border border-red-900/60 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-900/50 cursor-pointer"
            >
              Supprimer
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg bg-zinc-900 border border-zinc-800 px-4.5 py-2.5 text-sm font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => onSave(editingSession)}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4.5 py-2.5 text-sm font-bold text-white hover:from-emerald-400 hover:to-teal-500 cursor-pointer"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
