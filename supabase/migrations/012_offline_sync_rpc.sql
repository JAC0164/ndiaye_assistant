-- ============================================================
-- Migration 012 — Offline Sync RPC + Streak Engine
-- ============================================================
-- Ce fichier contient :
--   1. RPC sync_offline_data (point d'entrée unique pour la
--      synchronisation mobile → serveur)
--   2. RPC compute_streak (logique de streak réutilisable)
--   3. Trigger automatique sur insert dans historique
-- ============================================================

-- ============================================================
-- 1. FONCTION PRIVÉE : compute_streak_for_user
-- Calcule les streaks (current, longest, last_date) pour un
-- utilisateur donné en analysant l'historique des complétions.
-- ============================================================
CREATE OR REPLACE FUNCTION private.compute_streak_for_user(p_user_id UUID)
RETURNS TABLE(current_streak INT, longest_streak INT, last_streak_date DATE)
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_streak INT := 0;
  v_longest_streak INT := 0;
  v_last_date DATE;
  v_check_date DATE;
  v_has_entry BOOLEAN;
BEGIN
  -- Récupérer la dernière date de complétion
  SELECT MAX(completed_at::DATE) INTO v_last_date
  FROM historique
  WHERE user_id = p_user_id;

  -- Si aucune entrée, retourner 0
  IF v_last_date IS NULL THEN
    current_streak := 0;
    longest_streak := 0;
    last_streak_date := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Compter les jours consécutifs à partir de la dernière date
  v_check_date := v_last_date;
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM historique
      WHERE user_id = p_user_id
        AND completed_at::DATE = v_check_date
      LIMIT 1
    ) INTO v_has_entry;

    EXIT WHEN NOT v_has_entry;
    v_current_streak := v_current_streak + 1;
    v_check_date := v_check_date - INTERVAL '1 day';
  END LOOP;

  -- Récupérer le longest_streak existant depuis le profil
  SELECT COALESCE(p.longest_streak, 0) INTO v_longest_streak
  FROM profiles p
  WHERE p.id = p_user_id;

  -- Mettre à jour si le nouveau streak est plus long
  IF v_current_streak > v_longest_streak THEN
    v_longest_streak := v_current_streak;
  END IF;

  current_streak := v_current_streak;
  longest_streak := v_longest_streak;
  last_streak_date := v_last_date;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.compute_streak_for_user(UUID) FROM PUBLIC, anon;

-- ============================================================
-- 2. FONCTION PRIVÉE : sync_historique
-- Insère les nouvelles entrées d'historique envoyées par le
-- mobile. Chaque ligne doit avoir un UUID généré côté client
-- pour permettre ON CONFLICT DO NOTHING (idempotence).
-- ============================================================
CREATE OR REPLACE FUNCTION private.sync_historique(
  p_user_id UUID,
  p_entries JSONB
)
RETURNS INT -- nombre de lignes insérées
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  WITH ins AS (
    INSERT INTO historique (id, user_id, session_id, subject, session_type,
                            duration_minutes, feedback, notes, completed_at)
    SELECT
      COALESCE((elem->>'id')::UUID, gen_random_uuid()),
      p_user_id,
      (elem->>'session_id')::UUID,
      elem->>'subject',
      (elem->>'session_type')::session_type,
      (elem->>'duration_minutes')::SMALLINT,
      COALESCE((elem->>'feedback')::feedback_rating, 'MOYEN'),
      elem->>'notes',
      COALESCE((elem->>'completed_at')::TIMESTAMPTZ, now())
    FROM JSONB_ARRAY_ELEMENTS(p_entries) AS elem
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_historique(UUID, JSONB) FROM PUBLIC, anon;

-- ============================================================
-- 3. FONCTION PUBLIQUE : sync_offline_data
-- Point d'entrée unique pour la synchronisation mobile.
-- Accepte un JSON structuré :
-- {
--   "historique": [{ id, session_id, subject, session_type,
--                    duration_minutes, feedback, notes, completed_at }],
--   "sessions": [{ day_of_week, start_time, end_time, subject,
--                  session_type, pedagogical_note }]
-- }
--
-- Sécurité :
--   - Vérifie auth.uid() = p_user_id
--   - Transaction atomique (tout ou rien)
--   - Chaque ligne d'historique est vérifiée individuellement
--     dans private.sync_historique via ON CONFLICT
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_offline_data(
  p_user_id UUID,
  p_payload JSONB
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_historique_entries JSONB;
  v_sessions_entries JSONB;
  v_hist_inserted INT := 0;
  v_sessions_inserted INT := 0;
  v_streak RECORD;
  v_result JSONB;
BEGIN
  -- === VÉRIFICATION D'AUTH ===
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized'
      USING HINT = 'You can only sync your own data';
  END IF;

  -- === EXTRAIRE LES TABLEAUX DU PAYLOAD ===
  v_historique_entries := COALESCE(p_payload->'historique', '[]'::JSONB);
  v_sessions_entries   := COALESCE(p_payload->'sessions', '[]'::JSONB);

  -- === TRANSACTION ATOMIQUE ===
  BEGIN
    -- 1. Synchroniser l'historique
    IF JSONB_ARRAY_LENGTH(v_historique_entries) > 0 THEN
      SELECT private.sync_historique(p_user_id, v_historique_entries)
        INTO v_hist_inserted;
    END IF;

    -- 2. Remplacer les sessions (planning cyclique)
    IF JSONB_ARRAY_LENGTH(v_sessions_entries) > 0 THEN
      SELECT COUNT(*)::INT INTO v_sessions_inserted
      FROM private.replace_user_sessions_internal(p_user_id, v_sessions_entries);
    END IF;

    -- 3. Recalculer le streak
    SELECT * INTO v_streak
    FROM private.compute_streak_for_user(p_user_id);

    UPDATE profiles
    SET
      current_streak  = v_streak.current_streak,
      longest_streak   = GREATEST(longest_streak, v_streak.longest_streak),
      last_streak_date = v_streak.last_streak_date,
      updated_at       = now()
    WHERE id = p_user_id;

    -- 4. Construire le résultat
    v_result := JSONB_BUILD_OBJECT(
      'status', 'ok',
      'historique_inserted', v_hist_inserted,
      'sessions_replaced', v_sessions_inserted,
      'current_streak', v_streak.current_streak,
      'longest_streak', v_streak.longest_streak,
      'last_streak_date', v_streak.last_streak_date
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Sync failed: %', SQLERRM
      USING HINT = 'Transaction rolled back - no data was persisted';
  END;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_offline_data(UUID, JSONB) FROM PUBLIC, anon;

-- ============================================================
-- 4. TRIGGER : auto-recalcul du streak à l'insertion
-- Lorsqu'une ligne est insérée dans historique via une requête
-- directe (pas via l'API, mais depuis l'interface web ou une
-- insertion manuelle), le streak est automatiquement mis à jour.
-- ============================================================
CREATE OR REPLACE FUNCTION private.trigger_update_streak()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_streak RECORD;
BEGIN
  SELECT * INTO v_streak
  FROM private.compute_streak_for_user(NEW.user_id);

  UPDATE profiles
  SET
    current_streak  = v_streak.current_streak,
    longest_streak   = GREATEST(longest_streak, v_streak.longest_streak),
    last_streak_date = v_streak.last_streak_date,
    updated_at       = now()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_historique_update_streak ON historique;
CREATE TRIGGER trg_historique_update_streak
  AFTER INSERT ON historique
  FOR EACH ROW
  EXECUTE FUNCTION private.trigger_update_streak();

-- ============================================================
-- 5. NETTOYAGE : mise à jour de l'index existant
 -- L'index créé dans 011 couvre (user_id, completed_at) pour
-- le leaderboard. Ajout d'un index sur (completed_at::DATE)
-- pour accélérer le calcul de streak (agrégation par jour).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_historique_user_date_only
  ON historique(user_id, (completed_at::DATE));
