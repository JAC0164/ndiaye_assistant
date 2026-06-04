"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/src/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import type { GeneratedSeance } from "@/src/lib/langgraph/state"
import type { ModelProvider, ModelProviderConfig, ModelOverrides } from "@/src/lib/langgraph/providers"
import { getProviderLabel } from "@/src/lib/langgraph/providers"
import WeeklySchedule from "@/src/components/WeeklySchedule"

type ApiResponse = {
  isValidTimetable: boolean
  extractedTimetableMarkdown?: string
  studentProfileContext?: string
  generatedPlanning: GeneratedSeance[]
  insertedSeances: unknown[]
  validationErrorMessage?: string
}

const PROVIDERS: ModelProvider[] = ["gemini", "openai", "anthropic", "ollama", "deepseek"]

const DEFAULT_AGENT_CONFIG: Record<string, { model: string }> = {
  default: { model: "gemini-2.5-flash" },
  vision: { model: "gemini-2.5-flash" },
  profile: { model: "gemini-2.5-flash" },
  planner: { model: "gemini-2.5-flash" },
}

const DEFAULT_ONBOARDING = JSON.stringify(
  {
    name: "Élève test",
    class: "Terminale S1",
    serie: "S1",
    schoolLevel: "Lycee",
    subjects: ["Mathématiques", "Physique", "SVT", "Français", "Anglais", "Histoire", "Philosophie"],
    goals: ["Réussir le bac", "Progresser en maths"],
    constraints: ["Transport 30min", "Pas de révisions après 21h"],
  },
  null,
  2
)

type AgentSlot = "vision" | "profile" | "planner"

interface AgentOverrideEntry {
  provider: ModelProvider
  model: string
}

export default function PlanningPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [onboardingData, setOnboardingData] = useState(DEFAULT_ONBOARDING)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [showModelConfig, setShowModelConfig] = useState(false)
  const [modelOverrides, setModelOverrides] = useState<
    Record<AgentSlot | "default", AgentOverrideEntry>
  >({
    default: { provider: "gemini", model: "gemini-2.5-flash" },
    vision: { provider: "gemini", model: "gemini-2.5-flash" },
    profile: { provider: "gemini", model: "gemini-2.5-flash" },
    planner: { provider: "gemini", model: "gemini-2.5-flash" },
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth")
        return
      }
      setUser(user)
      setLoading(false)
    })
  }, [router, supabase.auth])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth")
    router.refresh()
  }

  function buildModelOverridesPayload(): ModelOverrides | undefined {
    const defaultCfg = modelOverrides.default
    const overrides: ModelOverrides = {}

    for (const agent of ["vision", "profile", "planner"] as AgentSlot[]) {
      const cfg = modelOverrides[agent]
      // Only send override if it differs from default or is explicitly set
      if (cfg.provider !== defaultCfg.provider || cfg.model !== defaultCfg.model) {
        const partial: Partial<ModelProviderConfig> = {}
        if (cfg.provider !== defaultCfg.provider) partial.provider = cfg.provider
        if (cfg.model !== defaultCfg.model) partial.model = cfg.model
        overrides[agent] = partial
      }
    }

    return Object.keys(overrides).length > 0 ? overrides : undefined
  }

  const handleGenerate = async () => {
    setError(null)
    setResult(null)

    if (!imageFile) {
      setError("Veuillez sélectionner une image d'emploi du temps.")
      return
    }

    let parsedOnboarding: unknown
    try {
      parsedOnboarding = JSON.parse(onboardingData)
    } catch {
      setError("Les données d'onboarding contiennent un JSON invalide.")
      return
    }

    setGenerating(true)

    try {
      const formData = new FormData()
      formData.set("timetableImage", imageFile)
      formData.set("onboardingData", JSON.stringify(parsedOnboarding))

      const payload = buildModelOverridesPayload()
      if (payload) {
        formData.set("modelOverrides", JSON.stringify(payload))
      }

      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`
      }

      const res = await fetch("/api/planning/generate", {
        method: "POST",
        headers,
        body: formData,
      })

      const body: ApiResponse = await res.json()

      if (!res.ok && res.status !== 422) {
        setError(body && "error" in body ? (body as unknown as { error: string }).error : "Erreur serveur")
        return
      }

      setResult(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau")
    } finally {
      setGenerating(false)
    }
  }

  function updateAgentOverride(
    agent: AgentSlot | "default",
    field: keyof AgentOverrideEntry,
    value: string
  ) {
    setModelOverrides((prev) => ({
      ...prev,
      [agent]: { ...prev[agent], [field]: value },
    }))
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Chargement...
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test Planning Ndiaye</h1>
          <p className="text-sm text-zinc-500">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100"
        >
          Déconnexion
        </button>
      </div>

      {/* Form */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Image upload */}
        <div className="rounded-xl border border-zinc-200 p-5">
          <h2 className="mb-3 text-sm font-semibold">Emploi du temps (image)</h2>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 p-6 text-sm text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-50">
            {imageFile ? (
              <span className="text-zinc-800">{imageFile.name}</span>
            ) : (
              <>
                <span className="text-lg">📷</span>
                <span>Clique pour sélectionner une image</span>
                <span className="text-xs text-zinc-400">
                  WEBP, PNG ou JPEG
                </span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/webp,image/png,image/jpeg"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          {imageFile && (
            <button
              onClick={() => {
                setImageFile(null)
                if (fileRef.current) fileRef.current.value = ""
              }}
              className="mt-2 text-xs text-red-500 underline"
            >
              Retirer
            </button>
          )}
        </div>

        {/* Onboarding data */}
        <div className="rounded-xl border border-zinc-200 p-5">
          <h2 className="mb-3 text-sm font-semibold">
            Données d&apos;onboarding (JSON)
          </h2>
          <textarea
            value={onboardingData}
            onChange={(e) => setOnboardingData(e.target.value)}
            rows={10}
            className="w-full resize-none rounded-lg border border-zinc-300 p-3 font-mono text-xs focus:border-zinc-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Model Overrides */}
      <div className="rounded-xl border border-zinc-200">
        <button
          onClick={() => setShowModelConfig(!showModelConfig)}
          className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold"
        >
          <span>Configuration des modèles LLM</span>
          <span className="text-zinc-400">{showModelConfig ? "▲" : "▼"}</span>
        </button>
        {showModelConfig && (
          <div className="border-t border-zinc-200 px-5 py-4">
            <div className="grid gap-4">
              {(["default", "vision", "profile", "planner"] as const).map((agent) => (
                <div key={agent} className="grid grid-cols-3 gap-3 rounded-lg bg-zinc-50 p-3">
                  <div className="flex items-center text-sm font-medium capitalize text-zinc-600">
                    {agent === "default" ? "Défaut" : agent}
                    {agent !== "default" && (
                      <span className="ml-2 text-[10px] text-zinc-400">
                        {modelOverrides[agent].provider !== modelOverrides.default.provider ||
                        modelOverrides[agent].model !== modelOverrides.default.model
                          ? "⚠️ override"
                          : ""}
                      </span>
                    )}
                  </div>
                  <select
                    value={modelOverrides[agent].provider}
                    onChange={(e) => updateAgentOverride(agent, "provider", e.target.value)}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {getProviderLabel(p)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={modelOverrides[agent].model}
                    onChange={(e) => updateAgentOverride(agent, "model", e.target.value)}
                    placeholder={`Modèle pour ${agent}`}
                    className="rounded border border-zinc-300 px-2 py-1 font-mono text-xs"
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
              Laisse &quot;Défaut&quot; pour utiliser le provider principal. Si un agent a les mêmes
              valeurs que le défaut, il ne sera pas inclus dans la requête. Les clés API sont lues
              depuis les variables d&apos;environnement (GOOGLE_API_KEY, OPENAI_API_KEY,
              ANTHROPIC_API_KEY, DEEPSEEK_API_KEY).
            </p>
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleGenerate}
          disabled={generating || !imageFile}
          className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
        >
          {generating ? "Génération en cours..." : "Générer le planning"}
        </button>
        {error && (
          <p className="rounded bg-red-50 px-3 py-1.5 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="flex flex-col gap-6">
          {/* Validation status */}
          <div
            className={`rounded-lg border p-4 ${
              result.isValidTimetable
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <p className="text-sm font-semibold">
              Emploi du temps {result.isValidTimetable ? "valide" : "invalide"}
            </p>
            {result.validationErrorMessage && (
              <p className="mt-1 text-xs">{result.validationErrorMessage}</p>
            )}
          </div>

          {/* Extracted timetable */}
          {result.extractedTimetableMarkdown && (
            <div className="rounded-xl border border-zinc-200 p-5">
              <h2 className="mb-2 text-sm font-semibold">
                Emploi du temps extrait
              </h2>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-mono text-xs leading-relaxed text-zinc-700">
                {result.extractedTimetableMarkdown}
              </pre>
            </div>
          )}

          {/* Student profile context */}
          {result.studentProfileContext && (
            <div className="rounded-xl border border-zinc-200 p-5">
              <h2 className="mb-2 text-sm font-semibold">
                Profil étudiant
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600">
                {result.studentProfileContext}
              </p>
            </div>
          )}

          {/* Generated planning */}
          {result.generatedPlanning.length > 0 && (
            <div className="rounded-xl border border-zinc-200 p-5">
              <h2 className="mb-4 text-sm font-semibold">
                Planning généré ({result.generatedPlanning.length} séances)
              </h2>
              <WeeklySchedule seances={result.generatedPlanning} />
            </div>
          )}

          {/* Inserted seances count */}
          {result.insertedSeances.length > 0 && (
            <p className="text-xs text-zinc-400">
              {result.insertedSeances.length} séances insérées en base.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
