import Link from "next/link"

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Ndiaye</h1>
        <p className="mt-2 text-zinc-500">Assistant de planning scolaire — Test API</p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/auth"
          className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
        >
          Connexion
        </Link>
        <Link
          href="/planning"
          className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium transition hover:bg-zinc-100"
        >
          Planning
        </Link>
      </div>
      <p className="max-w-md text-center text-xs text-zinc-400">
        Connecte-toi pour uploader un emploi du temps, générer un planning de révisions intelligent avec l&apos;IA
        Ndiaye, et visualiser tes séances.
      </p>
    </div>
  )
}
