"use client"

import type { OnboardingForm, BlockedSlot } from "@/app/planning/page"
import { SERIES_SUBJECTS, SERIES_INFO, BEDTIME_OPTIONS, FULL_DAY_LABELS } from "@/src/lib/planning/constants"
import BlockedSlotBuilder from "./BlockedSlotBuilder"

interface OnboardingFormPanelProps {
  form: OnboardingForm
  onChange: (form: OnboardingForm) => void
}

export default function OnboardingFormPanel({ form, onChange }: OnboardingFormPanelProps) {
  
  const handleToggleWeakSubject = (subject: string) => {
    const isWeak = form.weakSubjects.includes(subject)
    const updated = isWeak
      ? form.weakSubjects.filter((s) => s !== subject)
      : [...form.weakSubjects, subject]
    
    onChange({
      ...form,
      weakSubjects: updated,
    })
  }

  const handleAddBlockedSlot = (newSlotData: {
    day: BlockedSlot['day']
    startTime: string
    endTime: string
    reason: string
  }) => {
    const newSlot: BlockedSlot = {
      id: Math.random().toString(36).substring(2, 11),
      ...newSlotData,
    }
    onChange({
      ...form,
      blockedSlots: [...form.blockedSlots, newSlot],
    })
  }

  const handleRemoveBlockedSlot = (id: string) => {
    onChange({
      ...form,
      blockedSlots: form.blockedSlots.filter((s) => s.id !== id),
    })
  }

  return (
    <div className="flex flex-col gap-5 overflow-y-auto max-h-[420px] pr-1">
      
      {/* Track Selector (Série) */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Série / Filière</label>
        <div className="grid grid-cols-5 gap-2 mt-2">
          {SERIES_INFO.map((item) => {
            const isSelected = form.serie === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  onChange({
                    ...form,
                    serie: item.value as OnboardingForm['serie'],
                    weakSubjects: []
                  })
                }}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition duration-150 cursor-pointer ${
                  isSelected
                    ? "bg-cyan-500/10 border-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                    : "bg-zinc-955 bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                }`}
              >
                <span className="text-sm font-bold">{item.label}</span>
                <span className="text-[9px] mt-0.5 opacity-60 truncate max-w-full">{item.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Weak Subjects Grid (Matières faibles) */}
      <div className="border-t border-zinc-900 pt-4">
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Matières à renforcer</label>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Sélectionner pour prioriser</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(SERIES_SUBJECTS[form.serie] || SERIES_SUBJECTS["S1"]).map((sub) => {
            const isWeak = form.weakSubjects.includes(sub)
            return (
              <button
                key={sub}
                type="button"
                onClick={() => handleToggleWeakSubject(sub)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition cursor-pointer ${
                  isWeak
                    ? "bg-amber-500/10 border-amber-500 text-amber-200"
                    : "bg-zinc-955 bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-350"
                }`}
              >
                <span>{isWeak ? "⚠️" : "📚"}</span>
                <span>{sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bedtime / Sleep Limit Slider */}
      <div className="border-t border-zinc-900 pt-4">
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Couvre-feu / Fin de révision</label>
          <span className="text-xs font-bold text-cyan-400 flex items-center gap-1">🌙 {form.bedtime}</span>
        </div>
        <input
          type="range"
          min={0}
          max={BEDTIME_OPTIONS.length - 1}
          value={BEDTIME_OPTIONS.indexOf(form.bedtime) !== -1 ? BEDTIME_OPTIONS.indexOf(form.bedtime) : 4}
          onChange={(e) => {
            const val = BEDTIME_OPTIONS[parseInt(e.target.value)]
            onChange({ ...form, bedtime: val })
          }}
          className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-2"
        />
        <div className="flex justify-between text-[10px] text-zinc-550 mt-1">
          <span>20h00</span>
          <span>21h30</span>
          <span>23h30</span>
        </div>
      </div>

      {/* Time Blockers / Constraints Manager */}
      <div className="border-t border-zinc-900 pt-4">
        <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Créneaux indisponibles / Cours du soir</label>
        
        {/* Active Blocked Slots List */}
        <div className="space-y-2 mt-2">
          {form.blockedSlots.map((slot) => {
            const dayLabel = FULL_DAY_LABELS[slot.day] || slot.day
            return (
              <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-955 bg-zinc-950/60 border border-zinc-900 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-red-400">🚫</span>
                  <div>
                    <span className="font-bold text-zinc-300">{dayLabel} {slot.startTime} - {slot.endTime}</span>
                    <span className="text-zinc-550 block text-[10px]">{slot.reason}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBlockedSlot(slot.id)}
                  className="text-[10px] font-bold text-zinc-500 hover:text-red-400 transition cursor-pointer"
                >
                  Supprimer
                </button>
              </div>
            )
          })}
          {form.blockedSlots.length === 0 && (
            <p className="text-xs text-zinc-500 italic">Aucun créneau d&apos;indisponibilité renseigné.</p>
          )}
        </div>

        {/* Add Blocked Slot Form Row */}
        <BlockedSlotBuilder onAdd={handleAddBlockedSlot} />
      </div>

    </div>
  )
}
