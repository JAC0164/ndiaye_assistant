"use client"

import { useMemo } from "react"

interface MarkdownPreviewProps {
  content: string
}

function parseMarkdown(text: string): string {
  // Échapper le HTML brut pour des raisons de sécurité
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  // Gras (**texte**)
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong class='font-bold text-white'>$1</strong>")

  // Titres (#, ##, ###)
  html = html.replace(/^### (.*?)$/gm, "<h4 class='text-sm font-bold text-emerald-400 mt-5 mb-2'>$1</h4>")
  html = html.replace(
    /^## (.*?)$/gm,
    "<h3 class='text-base font-bold text-white mt-6 mb-3 border-b border-zinc-900 pb-1.5'>$1</h3>"
  )
  html = html.replace(/^# (.*?)$/gm, "<h2 class='text-lg font-extrabold text-white mt-8 mb-4'>$1</h2>")

  // Listes à puces (- élément)
  html = html.replace(
    /^\s*-\s+(.*?)$/gm,
    "<li class='list-disc list-inside text-zinc-300 ml-4 mb-2 text-sm leading-relaxed'>$1</li>"
  )

  // Parsing des tableaux Markdown en tableaux HTML stylisés
  const lines = html.split("\n")
  let inTable = false
  const processedLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith("|") && line.endsWith("|")) {
      // Sauter les séparateurs comme |---|---|
      if (line.replace(/[\s|:-]/g, "").length === 0) {
        continue
      }

      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())
      let rowHtml = ""
      if (!inTable) {
        inTable = true
        rowHtml +=
          "<div class='overflow-x-auto my-4'><table class='min-w-full border-collapse border border-zinc-900 text-sm'><thead class='bg-zinc-900/80 text-zinc-200'><tr>"
        cells.forEach((cell) => {
          rowHtml += `<th class='border border-zinc-900 px-4 py-2.5 text-left font-bold uppercase tracking-wider text-xs'>${cell}</th>`
        })
        rowHtml += "</tr></thead><tbody class='divide-y divide-zinc-900'>"
      } else {
        rowHtml += "<tr class='hover:bg-zinc-900/30 transition-colors'>"
        cells.forEach((cell) => {
          rowHtml += `<td class='border border-zinc-900 px-4 py-2.5 text-zinc-300 leading-relaxed'>${cell}</td>`
        })
        rowHtml += "</tr>"
      }
      processedLines.push(rowHtml)
    } else {
      if (inTable) {
        inTable = false
        processedLines.push("</tbody></table></div>")
      }
      processedLines.push(lines[i])
    }
  }
  if (inTable) {
    processedLines.push("</tbody></table></div>")
  }

  html = processedLines.join("\n")

  // Paragraphes
  html = html.replace(/\n\n/g, "</p><p class='mb-3 text-sm text-zinc-300 leading-relaxed'>")

  return html
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const parsedContent = useMemo(() => parseMarkdown(content), [content])

  return (
    <div className="prose prose-invert max-w-none text-zinc-300" dangerouslySetInnerHTML={{ __html: parsedContent }} />
  )
}
