"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/src/lib/supabase/client"

export default function AuthPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const authFn = isSignUp
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password })

    const { error } = await authFn

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (!isSignUp) {
      router.push("/planning")
      router.refresh()
    }

    setLoading(false)
    if (isSignUp) {
      setError("Inscription réussie ! Vérifie tes emails pour confirmer.")
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border p-8 shadow-sm">
        <h1 className="text-2xl font-bold">{isSignUp ? "Inscription" : "Connexion"}</h1>
        <p className="text-sm text-zinc-500">
          {isSignUp
            ? "Crée un compte pour tester l'API de planning Ndiaye"
            : "Connecte-toi pour accéder au test de planning"}
        </p>

        {error && (
          <p
            className={`rounded bg-red-50 px-3 py-2 text-sm ${
              error.includes("réussie") ? "text-green-600 bg-green-50" : "text-red-600"
            }`}
          >
            {error}
          </p>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />

        <input
          type="password"
          placeholder="Mot de passe (min. 12 caractères)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={12}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "..." : isSignUp ? "S'inscrire" : "Se connecter"}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp)
            setError(null)
          }}
          className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800"
        >
          {isSignUp ? "Déjà un compte ? Connecte-toi" : "Pas de compte ? Inscris-toi"}
        </button>
      </form>
    </div>
  )
}
