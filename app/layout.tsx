import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import Link from "next/link"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Ndiaye — Test Planning",
  description: "Application de test pour l'API de planning Ndiaye",
}

import { DisplayModeProvider } from "@/src/components/providers/DisplayModeProvider"
import PlanningOverlay from "@/src/components/PlanningOverlay"
import DisplayModeToggle from "@/src/components/DisplayModeToggle"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-150">
        <DisplayModeProvider>
          <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-6 py-3 backdrop-blur-md sticky top-0 z-40">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-zinc-100 hover:text-emerald-400 transition-colors"
            >
              Ndiaye Test
            </Link>
            <div className="flex items-center gap-6">
              <DisplayModeToggle />
              <nav className="flex gap-4 text-sm text-zinc-400">
                <Link href="/auth" className="hover:text-zinc-100 transition-colors">
                  Auth
                </Link>
                <Link href="/planning" className="hover:text-zinc-100 transition-colors">
                  Planning
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
          <PlanningOverlay />
        </DisplayModeProvider>
      </body>
    </html>
  )
}
