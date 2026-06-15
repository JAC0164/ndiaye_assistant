import { NextResponse } from "next/server"

export type ErrorResponse = {
  error: string
}

export type ImageUpload = {
  buffer: Buffer
  mimeType: string
}

export const REQUEST_TIMEOUT = Number(process.env.NDIAYE_REQUEST_TIMEOUT ?? 60_000)
export const MAX_IMAGE_SIZE = Number(process.env.NDIAYE_MAX_IMAGE_SIZE ?? 10 * 1024 * 1024)

export function jsonError(status: number, error: string) {
  return NextResponse.json<ErrorResponse>(
    { error },
    { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  )
}

export function parseJSONField<T>(value: FormDataEntryValue | null): T | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

export async function fileToBuffer(value: FormDataEntryValue | null): Promise<ImageUpload> {
  if (!(value instanceof File)) {
    throw new Error("Le champ timetableImage est requis.")
  }

  if (!value.type.startsWith("image/")) {
    throw new Error("Le fichier timetableImage doit être une image.")
  }

  if (value.size > MAX_IMAGE_SIZE) {
    throw new Error("L'image ne doit pas dépasser 10 Mo.")
  }

  return {
    buffer: Buffer.from(await value.arrayBuffer()),
    mimeType: value.type,
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`La requête a expiré après ${ms / 1000}s. Veuillez réessayer.`)), ms)
    ),
  ])
}
