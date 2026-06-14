import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockSupabase } from "@/src/test/utils/mock-supabase"
import { ProfileService, Profile } from "@/src/services/profile.service"
import { OnboardingForm, ProfileMetadata } from "@/src/types/planning.types"

describe("ProfileService", () => {
  let mock: ReturnType<typeof createMockSupabase>
  let service: ProfileService

  const baseProfile: Profile = {
    id: "user-1",
    email: "user@test.com",
    display_name: "Test User",
    avatar_url: null,
    birthday: null,
    confidence_level: null,
    class_id: null,
    metadata: {},
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  }

  beforeEach(() => {
    mock = createMockSupabase()
    service = new ProfileService(mock.supabase)
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should extend BaseService with profiles table", () => {
      expect(service["tableName"]).toBe("profiles")
    })
  })

  describe("getByUserId", () => {
    it("should fetch profile by id using maybeSingle", async () => {
      mock.setResult(baseProfile)
      const result = await service.getByUserId("user-1")

      expect(result).toEqual(baseProfile)
      expect(mock.supabase.from).toHaveBeenCalledWith("profiles")
      expect(mock.builder.select).toHaveBeenCalledWith("*")
      expect(mock.builder.eq).toHaveBeenCalledWith("id", "user-1")
      expect(mock.builder.maybeSingle).toHaveBeenCalled()
    })

    it("should return null when no profile found", async () => {
      mock.setResult(null)
      const result = await service.getByUserId("nonexistent")

      expect(result).toBeNull()
    })

    it("should throw on database error", async () => {
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("DB error"))
      })
      await expect(service.getByUserId("user-1")).rejects.toThrow("DB error")
    })

    it("should throw with wrapped message when database returns error in response", async () => {
      mock.builder.maybeSingle.mockResolvedValue({ data: null, error: new Error("not found") })
      delete mock.builder.then
      await expect(service.getByUserId("user-1")).rejects.toThrow("Erreur lors de la récupération du profil: not found")
    })
  })

  describe("updateOnboarding", () => {
    const onboarding: OnboardingForm = {
      weakSubjects: ["maths", "physique"],
      bedtime: "22:00",
      blockedSlots: [{ id: "1", day: "monday", startTime: "08:00", endTime: "10:00", reason: "school" }],
    }

    it("should merge onboarding data into metadata and update", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: { bedtime: "21:30" },
      })

      const updatedProfile = { ...baseProfile, metadata: { ...onboarding } }
      mock.setResult(updatedProfile)

      const result = await service.updateOnboarding("user-1", onboarding)

      expect(result).toEqual(updatedProfile)
      expect(mock.supabase.from).toHaveBeenCalledWith("profiles")
      expect(mock.builder.update).toHaveBeenCalledWith({
        metadata: {
          weakSubjects: ["maths", "physique"],
          bedtime: "22:00",
          blockedSlots: onboarding.blockedSlots,
        },
        updated_at: expect.any(String),
      })
      expect(mock.builder.eq).toHaveBeenCalledWith("id", "user-1")
      expect(mock.builder.select).toHaveBeenCalled()
      expect(mock.builder.single).toHaveBeenCalled()
    })

    it("should preserve existing metadata and merge with new onboarding", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: { cachedProfileContext: "existing context" },
      })

      mock.setResult(null)

      await service.updateOnboarding("user-1", onboarding)

      const updateCall = vi.mocked(mock.builder.update).mock.calls[0][0]
      expect(updateCall.metadata).toMatchObject({
        cachedProfileContext: "existing context",
        weakSubjects: ["maths", "physique"],
      })
    })

    it("should throw when profile does not exist", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue(null)

      await expect(service.updateOnboarding("user-1", onboarding)).rejects.toThrow(
        "Profil non trouvé pour l'utilisateur: user-1"
      )
    })

    it("should handle empty metadata gracefully", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: null as unknown as ProfileMetadata,
      })

      mock.setResult(baseProfile)

      await service.updateOnboarding("user-1", onboarding)

      const updateCall = vi.mocked(mock.builder.update).mock.calls[0][0]
      expect(updateCall.metadata).toEqual({
        weakSubjects: ["maths", "physique"],
        bedtime: "22:00",
        blockedSlots: onboarding.blockedSlots,
      })
    })

    it("should throw on update error", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue(baseProfile)
      mock.builder.then.mockImplementation((_resolve, reject) => {
        reject(new Error("update error"))
      })

      await expect(service.updateOnboarding("user-1", onboarding)).rejects.toThrow("update error")
    })

    it("should throw with wrapped message when update returns error in response", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue(baseProfile)
      mock.builder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: new Error("update failed") })
      })

      await expect(service.updateOnboarding("user-1", onboarding)).rejects.toThrow(
        "Erreur lors de la mise à jour des données d'onboarding: update failed"
      )
    })
  })

  describe("getCachedAnalysis", () => {
    it("should return CachedAnalysis when all cache fields exist", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: {
          cachedExtractedTimetable: "# Timetable markdown",
          cachedTimetableValid: true,
          cachedProfileContext: "Student is in S1",
        } as ProfileMetadata,
      })

      const result = await service.getCachedAnalysis("user-1")

      expect(result).toEqual({
        extractedTimetableMarkdown: "# Timetable markdown",
        isValidTimetable: true,
        studentProfileContext: "Student is in S1",
      })
    })

    it("should return null when profile is not found", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue(null)

      const result = await service.getCachedAnalysis("user-1")
      expect(result).toBeNull()
    })

    it("should return null when profile metadata is falsy", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: null as unknown as ProfileMetadata,
      })

      const result = await service.getCachedAnalysis("user-1")
      expect(result).toBeNull()
    })

    it("should return null when both timetable and context are not strings", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: {
          cachedExtractedTimetable: 123,
          cachedProfileContext: true,
        } as unknown as ProfileMetadata,
      })

      const result = await service.getCachedAnalysis("user-1")
      expect(result).toBeNull()
    })

    it("should return empty strings for non-string fields while isValidTimetable defaults to true", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: {
          cachedProfileContext: "Only context present",
        } as ProfileMetadata,
      })

      const result = await service.getCachedAnalysis("user-1")

      expect(result).toEqual({
        extractedTimetableMarkdown: "",
        isValidTimetable: true,
        studentProfileContext: "Only context present",
      })
    })

    it("should set isValidTimetable to false when cachedTimetableValid is false", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: {
          cachedExtractedTimetable: "# TT",
          cachedTimetableValid: false,
        } as ProfileMetadata,
      })

      const result = await service.getCachedAnalysis("user-1")
      expect(result!.isValidTimetable).toBe(false)
    })
  })

  describe("saveAnalysisCache", () => {
    it("should write all three cache fields into metadata and update", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: {} as ProfileMetadata,
      })

      mock.setResult(null)

      await service.saveAnalysisCache("user-1", "# Timetable", true, "Profile context")

      const updateCall = vi.mocked(mock.builder.update).mock.calls[0][0]
      expect(updateCall.metadata).toEqual({
        cachedExtractedTimetable: "# Timetable",
        cachedTimetableValid: true,
        cachedProfileContext: "Profile context",
      })
      expect(updateCall.updated_at).toEqual(expect.any(String))
      expect(mock.builder.eq).toHaveBeenCalledWith("id", "user-1")
    })

    it("should not write undefined fields into metadata", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: {} as ProfileMetadata,
      })

      mock.setResult(null)

      await service.saveAnalysisCache("user-1", "# Timetable", undefined, undefined)

      const updateCall = vi.mocked(mock.builder.update).mock.calls[0][0]
      expect(updateCall.metadata).toEqual({
        cachedExtractedTimetable: "# Timetable",
      })
    })

    it("should do nothing when profile does not exist", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue(null)

      await service.saveAnalysisCache("user-1", "# TT", true, "ctx")

      expect(mock.supabase.from).not.toHaveBeenCalled()
    })

    it("should preserve existing metadata when writing cache", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: {
          serie: "S1",
          bedtime: "22:00",
        } as ProfileMetadata,
      })

      mock.setResult(null)

      await service.saveAnalysisCache("user-1", "# Timetable", undefined, undefined)

      const updateCall = vi.mocked(mock.builder.update).mock.calls[0][0]
      expect(updateCall.metadata).toEqual({
        serie: "S1",
        bedtime: "22:00",
        cachedExtractedTimetable: "# Timetable",
      })
    })

    it("should handle empty existing metadata gracefully", async () => {
      vi.spyOn(service, "getByUserId").mockResolvedValue({
        ...baseProfile,
        metadata: null as unknown as ProfileMetadata,
      })

      mock.setResult(null)

      await service.saveAnalysisCache("user-1", "# TT", true, "ctx")

      const updateCall = vi.mocked(mock.builder.update).mock.calls[0][0]
      expect(updateCall.metadata).toEqual({
        cachedExtractedTimetable: "# TT",
        cachedTimetableValid: true,
        cachedProfileContext: "ctx",
      })
    })
  })

  describe("saveVisionCache", () => {
    it("should delegate to saveAnalysisCache with timetable and isValid", async () => {
      const spy = vi.spyOn(service, "saveAnalysisCache").mockResolvedValue()

      await service.saveVisionCache("user-1", "# TT", false)

      expect(spy).toHaveBeenCalledWith("user-1", "# TT", false, undefined)
    })
  })

  describe("saveProfileCache", () => {
    it("should delegate to saveAnalysisCache with context only", async () => {
      const spy = vi.spyOn(service, "saveAnalysisCache").mockResolvedValue()

      await service.saveProfileCache("user-1", "Profile context")

      expect(spy).toHaveBeenCalledWith("user-1", undefined, undefined, "Profile context")
    })
  })
})
