export default function Home() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🤖</span>
          <h1 className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-4xl font-extrabold text-transparent">
            Ndiaye
          </h1>
        </div>
        <p className="text-zinc-500 text-sm">Assistant pédagogique intelligent</p>
      </div>
    </div>
  )
}
