import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ndiaye — Test Planning",
  description: "Application de test pour l'API de planning Ndiaye",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3">
          <a href="/" className="text-sm font-semibold tracking-tight">
            Ndiaye Test
          </a>
          <nav className="flex gap-4 text-sm text-zinc-500">
            <a href="/auth" className="hover:text-zinc-800">
              Auth
            </a>
            <a href="/planning" className="hover:text-zinc-800">
              Planning
            </a>
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
