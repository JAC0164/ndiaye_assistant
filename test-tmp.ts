import { validatePlanning } from "./src/lib/planning/validatePlanning"
const generated: any = [
  {
    day_of_week: "saturday",
    start_time: "09:00",
    end_time: "10:00",
    subject: "PC",
    session_type: "review",
    pedagogical_note: "",
  },
  {
    day_of_week: "saturday",
    start_time: "10:00",
    end_time: "10:10",
    subject: "Break",
    session_type: "break",
    pedagogical_note: "",
  },
  {
    day_of_week: "saturday",
    start_time: "10:10",
    end_time: "11:10",
    subject: "PC",
    session_type: "td",
    pedagogical_note: "",
  },
]
const budgets = new Map([
  ["PC", { totalMinutes: 120, reviewMinutes: 60, tdMinutes: 60 }],
  ["FR", { totalMinutes: 120, reviewMinutes: 60, tdMinutes: 60 }],
])
const allSubjects: any = [
  { name: "PC", coefficient: 4, subjectType: "scientific", daysPresent: [] },
  { name: "FR", coefficient: 4, subjectType: "literary", daysPresent: [] },
]
// Hack console log inside the loop
const oldLog = console.log
console.log = (...args) => oldLog("DEBUG:", ...args)
validatePlanning(generated, "22:00", [], { budgets, allSubjects })
