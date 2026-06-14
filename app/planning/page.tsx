"use client"

import Image from "next/image"
import { getProviderLabel } from "@/src/lib/langgraph/providers"
import WeeklySchedule from "@/src/components/weekly-schedule"
import MarkdownPreview from "@/src/components/planning/markdown-preview"
import OnboardingFormPanel from "@/src/components/planning/onboarding-form-panel"
import SessionEditModal from "@/src/components/planning/session-edit-modal"
import { PROVIDERS, usePlanningPage } from "./usePlanningPage"

export default function PlanningPage() {
  const {
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
  } = usePlanningPage()

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-base font-semibold text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span>Initialisation du tableau de bord...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🤖</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                Ndiaye Assistant
              </h1>
              <span className="rounded-full bg-emerald-950/60 px-3 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-900/60">
                Planning Dev-Harness
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start sm:self-center rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white transition duration-200"
          >
            Se déconnecter
          </button>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Timetable Upload Card */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/30 backdrop-blur-sm p-6 flex flex-col">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <span>📅</span> Emploi du temps scolaire
            </h2>

            <div className="flex-1 flex flex-col justify-center">
              {imagePreviewUrl ? (
                <div className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 flex flex-col items-center">
                  <div className="relative w-full h-[220px]">
                    <Image
                      src={imagePreviewUrl}
                      alt="Timetable Preview"
                      fill
                      unoptimized
                      className="rounded-lg object-contain"
                    />
                  </div>
                  <div className="mt-4 flex w-full items-center justify-between px-2 py-1 text-sm">
                    <span className="truncate text-zinc-400 font-mono text-xs">
                      {imageFile?.name} ({Math.round((imageFile?.size ?? 0) / 1024)} KB)
                    </span>
                    <button
                      onClick={() => {
                        setImageFile(null)
                        if (fileRef.current) fileRef.current.value = ""
                      }}
                      className="text-sm font-bold text-red-400 hover:text-red-300 transition"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-10 text-sm text-zinc-400 transition hover:border-emerald-500/50 hover:bg-zinc-900/20 hover:text-zinc-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-xl border border-zinc-800">
                    📷
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-sm">Cliquez pour importer l&apos;image</p>
                    <p className="text-xs text-zinc-500 mt-1">Glissez-déposez WEBP, PNG ou JPEG</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/webp,image/png,image/jpeg"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Onboarding Visual Form & JSON Code Editor */}
          <div className="rounded-2xl border border-zinc-900 bg-zinc-900/30 backdrop-blur-sm p-6 flex flex-col">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <span>👤</span> Profil & Contraintes
              </h2>

              <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-900 shrink-0">
                <button
                  onClick={() => setInputTab("form")}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-bold transition ${
                    inputTab === "form"
                      ? "bg-zinc-900 text-white shadow-sm border border-zinc-800"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Formulaire
                </button>
                <button
                  onClick={() => setInputTab("json")}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-bold transition ${
                    inputTab === "json"
                      ? "bg-zinc-900 text-white shadow-sm border border-zinc-800"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Code JSON
                </button>
              </div>
            </div>

            {inputTab === "form" ? (
              <OnboardingFormPanel
                form={formOnboarding}
                onChange={handleFormChange}
                availableSubjects={availableSubjects}
              />
            ) : (
              <div className="flex flex-col flex-1 gap-3">
                <textarea
                  value={onboardingData}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  rows={14}
                  className="w-full flex-1 resize-none rounded-xl border border-zinc-900 bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-emerald-400 focus:border-zinc-850 focus:outline-none"
                  spellCheck="false"
                />
                <div className="flex justify-end">
                  <button
                    onClick={prettifyJson}
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition duration-150"
                  >
                    🎨 Formater le JSON
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Model Config */}
        <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10">
          <button
            onClick={() => setShowModelConfig(!showModelConfig)}
            className="flex w-full items-center justify-between px-6 py-4.5 text-sm font-bold uppercase tracking-wider text-zinc-300"
          >
            <span className="flex items-center gap-2">⚙️ Configuration des Modèles LLM</span>
            <span className="text-xs text-zinc-500 font-bold">{showModelConfig ? "Fermer ▲" : "Configurer ▼"}</span>
          </button>
          {showModelConfig && (
            <div className="border-t border-zinc-900 px-6 py-6 bg-zinc-950/40 rounded-b-2xl">
              <div className="grid gap-3.5">
                {(["default", "vision", "profile", "planner"] as const).map((agent) => (
                  <div
                    key={agent}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 rounded-xl bg-zinc-900/40 border border-zinc-900 p-4 items-center"
                  >
                    <div className="flex items-center text-sm font-bold uppercase tracking-wider text-zinc-400">
                      {agent === "default" ? "⚙️ Défaut" : `🤖 Agent ${agent}`}
                      {agent !== "default" &&
                        (modelOverrides[agent].provider !== modelOverrides.default.provider ||
                          modelOverrides[agent].model !== modelOverrides.default.model) && (
                          <span className="ml-2 rounded-full bg-amber-950/50 border border-amber-900 px-2 py-0.5 text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">
                            Surchargé
                          </span>
                        )}
                    </div>
                    <select
                      value={modelOverrides[agent].provider}
                      onChange={(e) => updateAgentOverride(agent, "provider", e.target.value)}
                      className="rounded-lg bg-zinc-950 border border-zinc-900 px-3.5 py-2.5 text-sm text-white focus:outline-none"
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
                      className="rounded-lg bg-zinc-950 border border-zinc-900 px-3.5 py-2.5 font-mono text-sm text-white focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-zinc-500">
                Laisse &quot;Défaut&quot; pour utiliser le provider principal. Si un agent a les mêmes valeurs que le
                défaut, il ne sera pas inclus dans la requête. Les clés API sont lues depuis les variables
                d&apos;environnement (GOOGLE_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY).
              </p>
            </div>
          )}
        </div>

        {/* Generate triggers & Error Panel */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={generating || !imageFile}
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-7 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-950/20 transition duration-205 hover:from-emerald-400 hover:to-teal-500 disabled:from-zinc-900 disabled:to-zinc-900 disabled:opacity-40 disabled:text-zinc-600"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Analyse & Planification...
              </span>
            ) : (
              "Générer le planning"
            )}
          </button>

          {error && (
            <div className="rounded-xl bg-red-950/40 border border-red-900/60 px-4.5 py-3 text-sm text-red-400 w-full sm:w-auto font-medium">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Generation Results View */}
        {result && (
          <div className="flex flex-col gap-6 mt-4">
            <div
              className={`rounded-2xl border p-4.5 ${
                result.isValidTimetable
                  ? "border-emerald-900/60 bg-emerald-950/20 text-emerald-400"
                  : "border-red-900/60 bg-red-950/20 text-red-400"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wider">
                <span>{result.isValidTimetable ? "✓" : "✕"}</span>
                <span>Emploi du temps {result.isValidTimetable ? "valide" : "invalide"}</span>
              </div>
              {result.validationErrorMessage && (
                <p className="mt-2 text-sm opacity-80 leading-relaxed font-mono">{result.validationErrorMessage}</p>
              )}
            </div>

            <div className="flex border-b border-zinc-900">
              <button
                onClick={() => setOutputTab("schedule")}
                className={`px-5 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition ${
                  outputTab === "schedule"
                    ? "border-emerald-500 text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                📅 Planning
              </button>
              {result.extractedTimetableMarkdown && (
                <button
                  onClick={() => setOutputTab("markdown")}
                  className={`px-5 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition ${
                    outputTab === "markdown"
                      ? "border-emerald-500 text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  📝 Emploi Extrait (Markdown)
                </button>
              )}
              {result.studentProfileContext && (
                <button
                  onClick={() => setOutputTab("profile")}
                  className={`px-5 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition ${
                    outputTab === "profile"
                      ? "border-emerald-500 text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  👤 Profil Élève
                </button>
              )}
            </div>

            <div className="mt-2">
              {outputTab === "schedule" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                      Calendrier hebdomadaire cyclique ({result.generatedPlanning.length} séances)
                    </h3>
                    <div className="flex items-center gap-3.5">
                      {savingStatus === "success" && (
                        <span className="text-sm font-bold text-emerald-400 animate-pulse">
                          ✓ Enregistré avec succès !
                        </span>
                      )}
                      {savingStatus === "error" && (
                        <span className="text-sm font-bold text-red-400">⚠️ {savingError}</span>
                      )}
                      <button
                        onClick={handleSaveToDatabase}
                        disabled={savingStatus === "saving" || result.generatedPlanning.length === 0}
                        className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-zinc-800 disabled:opacity-40 transition"
                      >
                        {savingStatus === "saving" ? "Sauvegarde..." : "Enregistrer dans la base"}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 italic bg-zinc-900/10 border border-zinc-900/50 rounded-lg p-3 leading-relaxed">
                    💡 <strong>Astuce UIX :</strong> Cliquez sur une séance de révision pour la modifier, ajuster ses
                    horaires ou la supprimer directement du calendrier avant d&apos;enregistrer dans la base.
                  </p>

                  <WeeklySchedule
                    seances={result.generatedPlanning}
                    onEditSession={handleStartEditSession}
                    onAddSession={handleAddSession}
                  />
                </div>
              )}

              {outputTab === "markdown" && result.extractedTimetableMarkdown && (
                <div className="rounded-2xl border border-zinc-900 bg-zinc-900/30 backdrop-blur-sm p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                      Données extraites de l&apos;image
                    </h3>
                    <button
                      onClick={() => navigator.clipboard.writeText(result.extractedTimetableMarkdown ?? "")}
                      className="rounded-lg bg-zinc-950 border border-zinc-900 px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition"
                    >
                      Copier le texte brut
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl bg-zinc-950 p-6 border border-zinc-900 max-h-[500px] overflow-y-auto">
                    <MarkdownPreview content={result.extractedTimetableMarkdown} />
                  </div>
                </div>
              )}

              {outputTab === "profile" && result.studentProfileContext && (
                <div className="rounded-2xl border border-zinc-900 bg-zinc-900/30 backdrop-blur-sm p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
                    Synthèse cognitive & profil d&apos;apprentissage
                  </h3>
                  <div className="rounded-xl bg-zinc-950 p-5 border border-zinc-900 text-sm leading-relaxed text-zinc-300 space-y-2">
                    {result.studentProfileContext.split("\n").map((line, idx) => (
                      <p key={idx} className={line.trim() ? "mb-3" : "mb-1"}>
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <SessionEditModal
        key={editingSessionIndex}
        isOpen={showEditModal}
        session={editingSession}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveEditedSession}
        onDelete={handleDeleteSession}
      />
    </div>
  )
}
