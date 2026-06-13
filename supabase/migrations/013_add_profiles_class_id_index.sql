-- ============================================================
-- Migration 013 — Index sur profiles(class_id)
-- ============================================================

-- Index la FK profiles.class_id -> classes(id) pour les jointures
DROP INDEX IF EXISTS idx_profiles_class_id;
CREATE INDEX IF NOT EXISTS idx_profiles_class_id
  ON profiles(class_id);
