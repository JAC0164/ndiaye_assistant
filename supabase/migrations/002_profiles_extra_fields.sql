-- ============================================================
-- Migration 002 — Ajout des champs étendus au profil élève
-- birthday, confidence_level, class_id, metadata
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS confidence_level SMALLINT CHECK (confidence_level BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
