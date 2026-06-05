-- ============================================================
-- Migration 003 — Création des tables echeances et historique
-- ============================================================

-- 1. Table echeances (Devoirs, Examens, Compositions, Projets)
CREATE TABLE IF NOT EXISTS echeances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  echeance_type TEXT CHECK (echeance_type IN ('devoir', 'examen', 'composition', 'projet')),
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE echeances ENABLE ROW LEVEL SECURITY;

-- Policies for echeances
DROP POLICY IF EXISTS "read_own_echeances" ON echeances;
CREATE POLICY "read_own_echeances" ON echeances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_echeances" ON echeances;
CREATE POLICY "insert_own_echeances" ON echeances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_echeances" ON echeances;
CREATE POLICY "update_own_echeances" ON echeances
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_echeances" ON echeances;
CREATE POLICY "delete_own_echeances" ON echeances
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for echeances
CREATE INDEX IF NOT EXISTS idx_echeances_user_id ON echeances(user_id);
CREATE INDEX IF NOT EXISTS idx_echeances_due_date ON echeances(due_date);

-- Trigger for echeances updated_at
DROP TRIGGER IF EXISTS trg_echeances_updated_at ON echeances;
CREATE TRIGGER trg_echeances_updated_at
  BEFORE UPDATE ON echeances
  FOR EACH ROW
  EXECUTE FUNCTION private.trigger_set_updated_at();


-- 2. Table historique (Révisions validées)
CREATE TABLE IF NOT EXISTS historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  session_type session_type NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  duration_minutes SMALLINT,
  self_rating SMALLINT CHECK (self_rating BETWEEN 1 AND 5),
  notes TEXT
);

-- Enable RLS
ALTER TABLE historique ENABLE ROW LEVEL SECURITY;

-- Policies for historique
DROP POLICY IF EXISTS "read_own_historique" ON historique;
CREATE POLICY "read_own_historique" ON historique
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_historique" ON historique;
CREATE POLICY "insert_own_historique" ON historique
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_historique" ON historique;
CREATE POLICY "update_own_historique" ON historique
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_historique" ON historique;
CREATE POLICY "delete_own_historique" ON historique
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for historique
CREATE INDEX IF NOT EXISTS idx_historique_user_id ON historique(user_id);
CREATE INDEX IF NOT EXISTS idx_historique_completed_at ON historique(completed_at);
