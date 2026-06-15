import { describe, it, expect, vi } from "vitest"
import { jsonError, parseJSONField, fileToBuffer, withTimeout, MAX_IMAGE_SIZE } from "@/src/lib/route-utils"

describe("route-utils", () => {
  describe("jsonError", () => {
    it("returns a NextResponse with status and error message", async () => {
      const response = jsonError(400, "Bad Request")
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toEqual({ error: "Bad Request" })
      expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate")
    })
  })

  describe("parseJSONField", () => {
    it("returns undefined when value is null or not a string", () => {
      expect(parseJSONField(null)).toBeUndefined()
      expect(parseJSONField(undefined as any)).toBeUndefined()
    })

    it("returns undefined when value is empty or whitespace", () => {
      expect(parseJSONField("")).toBeUndefined()
      expect(parseJSONField("   ")).toBeUndefined()
    })

    it("returns parsed object for valid JSON string", () => {
      expect(parseJSONField('{"foo":"bar"}')).toEqual({ foo: "bar" })
    })

    it("returns undefined for invalid JSON string", () => {
      // This covers the catch block on line 29 of route-utils.ts
      expect(parseJSONField('{"foo": "bar"')).toBeUndefined()
    })
  })

  describe("fileToBuffer", () => {
    it("throws error when value is not a File instance", async () => {
      await expect(fileToBuffer(null)).rejects.toThrow("Le champ timetableImage est requis.")
      await expect(fileToBuffer("not-a-file" as any)).rejects.toThrow("Le champ timetableImage est requis.")
    })

    it("throws error when file is not an image", async () => {
      const file = new File(["foo"], "test.txt", { type: "text/plain" })
      await expect(fileToBuffer(file)).rejects.toThrow("Le fichier timetableImage doit être une image.")
    })

    it("throws error when image exceeds MAX_IMAGE_SIZE", async () => {
      const largeData = new Uint8Array(MAX_IMAGE_SIZE + 1)
      const file = new File([largeData], "test.png", { type: "image/png" })
      await expect(fileToBuffer(file)).rejects.toThrow("L'image ne doit pas dépasser 10 Mo.")
    })

    it("returns buffer and mimeType for a valid image file", async () => {
      const file = new File(["fake-image-bytes"], "test.png", { type: "image/png" })
      const result = await fileToBuffer(file)
      expect(result.mimeType).toBe("image/png")
      expect(result.buffer.toString()).toBe("fake-image-bytes")
    })
  })

  describe("withTimeout", () => {
    it("resolves with the promise value if it finishes before timeout", async () => {
      const promise = Promise.resolve("success")
      const result = await withTimeout(promise, 100)
      expect(result).toBe("success")
    })

    it("rejects with timeout error if the promise times out", async () => {
      vi.useFakeTimers()
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve("done"), 1000))
      const timeoutPromise = withTimeout(slowPromise, 100)

      // Fast forward timers
      vi.advanceTimersByTime(200)

      await expect(timeoutPromise).rejects.toThrow("La requête a expiré après 0.1s. Veuillez réessayer.")
      vi.useRealTimers()
    })
  })
})
