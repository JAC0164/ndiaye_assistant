"use client"

import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/src/lib/supabase/client"
import { ProfileService } from "@/src/services/profile.service"
import type { User } from "@supabase/supabase-js"
import type { GeneratedSeance } from "@/src/lib/langgraph/state"
import type { ModelProvider, ModelOverrides, ModelProviderConfig } from "@/src/lib/langgraph/providers"
import type { OnboardingForm, ApiResponse } from "@/src/types/planning.types"
import { clientLogger } from "@/src/lib/client-logger"
import { saveUserSessionsAction } from "./actions"

export const PROVIDERS: ModelProvider[] = ["gemini", "openai", "anthropic", "ollama", "deepseek"]

export type AgentSlot = "vision" | "profile" | "planner"

interface AgentOverrideEntry {
  provider: ModelProvider
  model: string
}

export const DEFAULT_ONBOARDING = JSON.stringify(
  {
    weakSubjects: ["MATH", "PC"],
    bedtime: "22:00",
    blockedSlots: [
      { id: "1", day: "tuesday", startTime: "18:00", endTime: "20:00", reason: "Cours du soir" },
      { id: "2", day: "thursday", startTime: "18:00", endTime: "20:00", reason: "Cours du soir" },
    ],
  },
  null,
  2
)

export function resizeImage(file: File, maxDim = 1568): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        let w = img.width
        let h = img.height

        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w)
            w = maxDim
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h)
            h = maxDim
          }
        }

        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(file)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else resolve(file)
          },
          file.type || "image/jpeg",
          0.85
        )
      }
      img.onerror = () => resolve(file)
      img.src = e.target?.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

export function buildModelOverridesPayload(
  modelOverrides: Record<AgentSlot | "default", AgentOverrideEntry>
): ModelOverrides | undefined {
  const defaultCfg = modelOverrides.default
  const overrides: ModelOverrides = {}

  for (const agent of ["vision", "profile", "planner"] as AgentSlot[]) {
    const cfg = modelOverrides[agent]
    if (cfg.provider !== defaultCfg.provider || cfg.model !== defaultCfg.model) {
      const partial: Partial<ModelProviderConfig> = {}
      if (cfg.provider !== defaultCfg.provider) partial.provider = cfg.provider
      if (cfg.model !== defaultCfg.model) partial.model = cfg.model
      overrides[agent] = partial
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined
}

export function usePlanningPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])

  const [inputTab, setInputTab] = useState<"form" | "json">("form")
  const [onboardingData, setOnboardingData] = useState(DEFAULT_ONBOARDING)
  const [formOnboarding, setFormOnboarding] = useState<OnboardingForm>(() => {
    try {
      const parsed = JSON.parse(DEFAULT_ONBOARDING)
      return {
        weakSubjects: parsed.weakSubjects || [],
        bedtime: parsed.bedtime || "22:00",
        blockedSlots: parsed.blockedSlots || [],
      }
    } catch {
      return { weakSubjects: [], bedtime: "22:00", blockedSlots: [] }
    }
  })

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [showModelConfig, setShowModelConfig] = useState(false)
  const [modelOverrides, setModelOverrides] = useState<Record<AgentSlot | "default", AgentOverrideEntry>>({
    default: { provider: "gemini", model: "gemini-2.5-flash" },
    vision: { provider: "gemini", model: "gemini-2.5-flash" },
    profile: { provider: "gemini", model: "gemini-2.5-flash" },
    planner: { provider: "gemini", model: "gemini-2.5-flash" },
  })

  const [outputTab, setOutputTab] = useState<"schedule" | "markdown" | "profile">("schedule")

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingSessionIndex, setEditingSessionIndex] = useState<number | null>(null)
  const [editingSession, setEditingSession] = useState<GeneratedSeance | null>(null)

  const [savingStatus, setSavingStatus] = useState<"idle" | "saving" | "success" | "error">("idle")
  const [savingError, setSavingError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/auth")
        return
      }
      setUser(user)

      try {
        const profileService = new ProfileService(supabase)
        const profile = await profileService.getByUserId(user.id)
        const classId = profile?.class_id
        const queryParam = classId ? `class_id=${classId}` : `class_name=Terminale S1`
        const res = await fetch(`/api/references/coefficients?${queryParam}`)
        if (res.ok) {
          const coeffs = await res.json()
          if (Array.isArray(coeffs)) {
            const subjects = coeffs.map((c: { subject: string }) => c.subject.toUpperCase())
            setAvailableSubjects(subjects)
          }
        }
      } catch (err) {
        clientLogger.error("Erreur lors du chargement du profil ou des coefficients:", err)
      }

      setLoading(false)
    })
  }, [router, supabase])

  const imagePreviewUrl = useMemo(() => {
    if (!imageFile) return null
    return URL.createObjectURL(imageFile)
  }, [imageFile])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    router.push("/auth")
    router.refresh()
  }, [supabase, router])

  const handleFormChange = useCallback((newForm: OnboardingForm) => {
    setFormOnboarding(newForm)
    setOnboardingData(JSON.stringify(newForm, null, 2))
  }, [])

  const handleJsonChange = useCallback((jsonStr: string) => {
    setOnboardingData(jsonStr)
    try {
      const parsed = JSON.parse(jsonStr)
      if (parsed && typeof parsed === "object") {
        setFormOnboarding({
          weakSubjects: Array.isArray(parsed.weakSubjects) ? parsed.weakSubjects : [],
          bedtime: parsed.bedtime || "22:00",
          blockedSlots: Array.isArray(parsed.blockedSlots) ? parsed.blockedSlots : [],
        })
      }
    } catch {
      // Don't sync invalid JSON to prevent editing cursor issues
    }
  }, [])

  const prettifyJson = useCallback(() => {
    try {
      const parsed = JSON.parse(onboardingData)
      setOnboardingData(JSON.stringify(parsed, null, 2))
    } catch {
      setError("Données JSON invalides. Impossible de formater.")
    }
  }, [onboardingData])

  const handleStartEditSession = useCallback((session: GeneratedSeance, index: number) => {
    setEditingSessionIndex(index)
    setEditingSession({ ...session })
    setShowEditModal(true)
  }, [])

  const handleSaveEditedSession = useCallback(() => {
    if (editingSessionIndex === null || !editingSession || !result) return
    const updated = [...result.generatedPlanning]
    updated[editingSessionIndex] = editingSession
    setResult({ ...result, generatedPlanning: updated })
    setShowEditModal(false)
  }, [editingSessionIndex, editingSession, result])

  const handleDeleteSession = useCallback(() => {
    if (editingSessionIndex === null || !result) return
    const updated = result.generatedPlanning.filter((_, idx) => idx !== editingSessionIndex)
    setResult({ ...result, generatedPlanning: updated })
    setShowEditModal(false)
  }, [editingSessionIndex, result])

  const handleAddSession = useCallback(
    (day: string) => {
      if (!result) return
      const defaultSubject = availableSubjects[0] || "MATH"
      const newSession: GeneratedSeance = {
        day_of_week: day as GeneratedSeance["day_of_week"],
        start_time: "17:00",
        end_time: "17:45",
        subject: defaultSubject,
        session_type: "review",
        pedagogical_note: "Réviser le cours du jour",
      }
      setResult({ ...result, generatedPlanning: [...result.generatedPlanning, newSession] })
    },
    [result, availableSubjects]
  )

  const handleSaveToDatabase = useCallback(async () => {
    if (!result || result.generatedPlanning.length === 0) return
    setSavingStatus("saving")
    setSavingError(null)

    try {
      const response = await saveUserSessionsAction(result.generatedPlanning)
      if (response.success) {
        setSavingStatus("success")
        window.dispatchEvent(new Event("ndiaye-sessions-saved"))
        setTimeout(() => setSavingStatus("idle"), 3000)
      }
    } catch (err) {
      setSavingStatus("error")
      setSavingError(err instanceof Error ? err.message : "Erreur de sauvegarde")
    }
  }, [result])

  const handleGenerate = useCallback(async () => {
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
      let uploadFile: Blob | File | null = imageFile
      if (imageFile) {
        try {
          uploadFile = await resizeImage(imageFile, 1568)
        } catch {
          // Fallback
        }
      }
      if (uploadFile) {
        formData.set("timetableImage", uploadFile, imageFile?.name || "timetable.jpg")
      }
      formData.set("onboardingData", JSON.stringify(parsedOnboarding))

      const payload = buildModelOverridesPayload(modelOverrides)
      if (payload) {
        formData.set("modelOverrides", JSON.stringify(payload))
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
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
      setOutputTab("schedule")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau")
    } finally {
      setGenerating(false)
    }
  }, [imageFile, onboardingData, modelOverrides, supabase])

  const updateAgentOverride = useCallback(
    (agent: AgentSlot | "default", field: keyof AgentOverrideEntry, value: string) => {
      setModelOverrides((prev) => ({
        ...prev,
        [agent]: { ...prev[agent], [field]: value },
      }))
    },
    []
  )

  return {
    user,
    loading,
    imageFile,
    setImageFile,
    availableSubjects,
    inputTab,
    setInputTab,
    onboardingData,
    formOnboarding,
    generating,
    result,
    error,
    fileRef,
    showModelConfig,
    setShowModelConfig,
    modelOverrides,
    outputTab,
    setOutputTab,
    showEditModal,
    editingSession,
    editingSessionIndex,
    savingStatus,
    savingError,
    imagePreviewUrl,
    handleLogout,
    handleFormChange,
    handleJsonChange,
    prettifyJson,
    handleStartEditSession,
    handleSaveEditedSession,
    handleDeleteSession,
    handleAddSession,
    handleSaveToDatabase,
    handleGenerate,
    updateAgentOverride,
    setEditingSession,
    setShowEditModal,
    setResult,
    setError,
  }
}
