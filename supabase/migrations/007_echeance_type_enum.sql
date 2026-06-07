-- ============================================================
-- Migration 007 — echeance_type TEXT CHECK → ENUM
-- ============================================================

DO $$ BEGIN
  CREATE TYPE echeance_type AS ENUM ('devoir', 'examen', 'composition', 'projet');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE echeances
  DROP CONSTRAINT IF EXISTS echeances_echeance_type_check,
  ALTER COLUMN echeance_type DROP DEFAULT,
  ALTER COLUMN echeance_type TYPE echeance_type USING echeance_type::echeance_type,
  ALTER COLUMN echeance_type SET NOT NULL;
