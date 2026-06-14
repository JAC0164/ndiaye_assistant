import type { GeneratedSeance } from "@/src/lib/langgraph/state"
import { DAYS, DAY_LABELS, TYPE_LABELS } from "@/src/lib/planning/constants"

const TYPE_COLORS: Record<string, string> = {
  course:
    "bg-blue-50/50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-300 hover:bg-blue-100/50 dark:hover:bg-blue-900/40",
  td: "bg-emerald-50/50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40",
  tp: "bg-purple-50/50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/60 text-purple-800 dark:text-purple-300 hover:bg-purple-100/50 dark:hover:bg-purple-900/40",
  review:
    "bg-amber-50/50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100/50 dark:hover:bg-amber-900/40",
  break:
    "bg-zinc-50/50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/60",
}

interface SortedSeance extends GeneratedSeance {
  index: number
}

function sortSeances(seances: GeneratedSeance[]): SortedSeance[] {
  const mapped = seances.map((s, index) => ({ ...s, index }))
  return mapped.sort((a, b) => {
    const dayDiff =
      DAYS.indexOf(a.day_of_week as (typeof DAYS)[number]) - DAYS.indexOf(b.day_of_week as (typeof DAYS)[number])
    if (dayDiff !== 0) return dayDiff
    return a.start_time.localeCompare(b.start_time)
  })
}

export default function WeeklySchedule({
  seances,
  onEditSession,
  onAddSession,
}: {
  seances: GeneratedSeance[]
  onEditSession?: (session: GeneratedSeance, index: number) => void
  onAddSession?: (day: string) => void
}) {
  const sorted = sortSeances(seances)
  const grouped = DAYS.map((day) => ({
    day,
    label: DAY_LABELS[day],
    sessions: sorted.filter((s) => s.day_of_week === day),
  }))

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="grid min-w-[1000px] grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800">
        {grouped.map(({ day, label, sessions }) => (
          <div key={day} className="bg-white dark:bg-zinc-950 flex flex-col">
            <div className="border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/80 dark:bg-zinc-900/50 px-2 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {label}
            </div>
            <div className="flex min-h-[250px] flex-1 flex-col gap-2.5 p-2">
              {sessions.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-zinc-300 dark:text-zinc-700 italic">Vide</p>
              )}
              {sessions.map((s) => {
                const isInteractive = !!onEditSession
                return (
                  <div
                    key={`${s.day_of_week}-${s.start_time}-${s.index}`}
                    onClick={() => isInteractive && onEditSession(s, s.index)}
                    className={`group relative rounded-lg border p-2.5 text-xs leading-snug transition-all duration-150 ${
                      TYPE_COLORS[s.session_type] ??
                      "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200"
                    } ${isInteractive ? "cursor-pointer hover:scale-[1.02] hover:shadow-sm" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-zinc-900 dark:text-white group-hover:text-amber-800 dark:group-hover:text-amber-300 transition-colors duration-150">
                        {s.subject}
                      </span>
                      <span className="shrink-0 rounded bg-white/70 dark:bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-semibold border border-black/[0.04] dark:border-white/[0.04]">
                        {TYPE_LABELS[s.session_type] ?? s.session_type}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs font-mono opacity-80 font-medium">
                      {s.start_time}–{s.end_time}
                    </div>
                    {s.pedagogical_note && (
                      <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed italic opacity-75">
                        {s.pedagogical_note}
                      </div>
                    )}
                  </div>
                )
              })}
              {onAddSession && (
                <button
                  onClick={() => onAddSession(day)}
                  className="mt-auto flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 transition hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <span className="text-sm">+</span> Ajouter
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
