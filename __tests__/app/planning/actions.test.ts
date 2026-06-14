import { describe, it, expect, vi, beforeEach } from "vitest"

const mockReplaceAll = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())

vi.mock("@/src/lib/supabase/actions", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock("@/src/services/session.service", () => ({
  SessionService: vi.fn(function () {
    return { replaceAll: mockReplaceAll }
  }),
}))

const mockRevalidatePath = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}))

import { saveUserSessionsAction } from "@/app/planning/actions"

describe("saveUserSessionsAction", () => {
  const mockSeances = [
    {
      day_of_week: "monday",
      start_time: "08:00",
      end_time: "08:45",
      subject: "MATH",
      session_type: "review",
      pedagogical_note: "",
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("replaces sessions and revalidates path when authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    })
    mockReplaceAll.mockResolvedValue(mockSeances)

    const result = await saveUserSessionsAction(mockSeances)

    expect(result).toEqual({ success: true, count: 1 })
    expect(mockReplaceAll).toHaveBeenCalledWith("user-1", mockSeances)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/planning")
  })

  it("throws when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("Not authenticated"),
    })

    await expect(saveUserSessionsAction(mockSeances)).rejects.toThrow("Authentification requise.")
    expect(mockReplaceAll).not.toHaveBeenCalled()
  })

  it("throws when user is null", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    await expect(saveUserSessionsAction(mockSeances)).rejects.toThrow("Authentification requise.")
    expect(mockReplaceAll).not.toHaveBeenCalled()
  })
})
