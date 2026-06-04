import type { GeneratedSeance } from "@/src/lib/langgraph/state"

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
const DAY_LABELS: Record<string, string> = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mer",
  thursday: "Jeu",
  friday: "Ven",
  saturday: "Sam",
  sunday: "Dim",
}

const TYPE_COLORS: Record<string, string> = {
  course: "bg-blue-50 border-blue-200 text-blue-800",
  td: "bg-green-50 border-green-200 text-green-800",
  tp: "bg-purple-50 border-purple-200 text-purple-800",
  review: "bg-amber-50 border-amber-200 text-amber-800",
  break: "bg-zinc-50 border-zinc-200 text-zinc-500",
}

const TYPE_LABELS: Record<string, string> = {
  course: "Cours",
  td: "TD",
  tp: "TP",
  review: "Révision",
  break: "Pause",
}

function sortSeances(seances: GeneratedSeance[]) {
  return [...seances].sort((a, b) => {
    const dayDiff = DAYS.indexOf(a.day_of_week as typeof DAYS[number]) - DAYS.indexOf(b.day_of_week as typeof DAYS[number])
    if (dayDiff !== 0) return dayDiff
    return a.start_time.localeCompare(b.start_time)
  })
}

export default function WeeklySchedule({
  seances,
}: {
  seances: GeneratedSeance[]
}) {
  const sorted = sortSeances(seances)
  const grouped = DAYS.map((day) => ({
    day,
    label: DAY_LABELS[day],
    sessions: sorted.filter((s) => s.day_of_week === day),
  }))

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-7 gap-px rounded-lg border border-zinc-200 bg-zinc-200">
        {grouped.map(({ day, label, sessions }) => (
          <div key={day} className="bg-white">
            <div className="border-b border-zinc-100 bg-zinc-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {label}
            </div>
            <div className="flex min-h-[200px] flex-col gap-1.5 p-1.5">
              {sessions.length === 0 && (
                <p className="px-1 text-[11px] text-zinc-300">—</p>
              )}
              {sessions.map((s, i) => (
                <div
                  key={`${s.day_of_week}-${s.start_time}-${i}`}
                  className={`rounded-md border px-2 py-1.5 text-[11px] leading-tight ${TYPE_COLORS[s.session_type] ?? "border-zinc-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-semibold">{s.subject}</span>
                    <span className="shrink-0 rounded bg-white/60 px-1 text-[10px] font-medium">
                      {TYPE_LABELS[s.session_type] ?? s.session_type}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] opacity-70">
                    {s.start_time}–{s.end_time}
                  </div>
                  {s.pedagogical_note && (
                    <div className="mt-0.5 line-clamp-2 text-[10px] italic opacity-60">
                      {s.pedagogical_note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
