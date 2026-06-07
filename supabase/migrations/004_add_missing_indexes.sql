-- ============================================================
-- Migration 004 — Index composites manquants pour les performances
-- ============================================================

-- 1. Index composite (user_id, due_date) pour echeances
-- Couvre: WHERE user_id = $1 AND due_date BETWEEN $2 AND $3 ORDER BY due_date
DROP INDEX IF EXISTS idx_echeances_user_due_date;
CREATE INDEX IF NOT EXISTS idx_echeances_user_due_date
  ON echeances(user_id, due_date);

-- On peut supprimer l'index simple user_id car le composite le couvre
DROP INDEX IF EXISTS idx_echeances_user_id;

-- 2. Index composite (user_id, completed_at DESC) pour historique
-- Couvre: WHERE user_id = $1 AND completed_at >= $2 ORDER BY completed_at DESC
DROP INDEX IF EXISTS idx_historique_user_completed;
CREATE INDEX IF NOT EXISTS idx_historique_user_completed
  ON historique(user_id, completed_at DESC);

-- On peut supprimer l'index simple user_id car le composite le couvre
DROP INDEX IF EXISTS idx_historique_user_id;

-- 3. Index sur classes(name) utilisé par coefficient.service.ts
DROP INDEX IF EXISTS idx_classes_name;
CREATE INDEX IF NOT EXISTS idx_classes_name
  ON classes(name);
