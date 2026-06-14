"use client"

import { useState } from "react"
import type { BlockedSlot } from "@/src/types/planning.types"

interface BlockedSlotBuilderProps {
  onAdd: (slot: { day: BlockedSlot["day"]; startTime: string; endTime: string; reason: string }) => void
}

export default function BlockedSlotBuilder({ onAdd }: BlockedSlotBuilderProps) {
  const [blockDay, setBlockDay] = useState<BlockedSlot["day"]>("monday")
  const [blockStartTime, setBlockStartTime] = useState("18:00")
  const [blockEndTime, setBlockEndTime] = useState("20:00")
  const [blockReason, setBlockReason] = useState("Cours du soir")

  const handleAdd = () => {
    onAdd({
      day: blockDay,
      startTime: blockStartTime,
      endTime: blockEndTime,
      reason: blockReason,
    })
  }

  return (
    <div className="mt-3 bg-zinc-950/30 border border-zinc-900 rounded-xl p-3 flex flex-col gap-2.5">
      <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Ajouter une indisponibilité :</p>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[9px] text-zinc-500 font-bold block mb-0.5">Jour</label>
          <select
            value={blockDay}
            onChange={(e) => setBlockDay(e.target.value as BlockedSlot["day"])}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
          >
            <option value="monday">Lundi</option>
            <option value="tuesday">Mardi</option>
            <option value="wednesday">Mercredi</option>
            <option value="thursday">Jeudi</option>
            <option value="friday">Vendredi</option>
            <option value="saturday">Samedi</option>
            <option value="sunday">Dimanche</option>
          </select>
        </div>

        <div>
          <label className="text-[9px] text-zinc-500 font-bold block mb-0.5">Début</label>
          <input
            type="time"
            value={blockStartTime}
            onChange={(e) => setBlockStartTime(e.target.value)}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[9px] text-zinc-500 font-bold block mb-0.5">Fin</label>
          <input
            type="time"
            value={blockEndTime}
            onChange={(e) => setBlockEndTime(e.target.value)}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Raison (ex: Cours du soir, Football, Soutien)..."
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-900 px-2.5 py-1.5 text-xs text-white focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 text-xs font-bold text-cyan-400 hover:bg-cyan-500/10 transition cursor-pointer"
        >
          + Bloquer
        </button>
      </div>
    </div>
  )
}
