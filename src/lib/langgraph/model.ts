import { ChatGoogleGenerativeAI } from "@langchain/google-genai"

export function createGeminiFlashModel() {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY ou GEMINI_API_KEY doit être défini côté serveur."
    )
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    temperature: 0,
  })
}
