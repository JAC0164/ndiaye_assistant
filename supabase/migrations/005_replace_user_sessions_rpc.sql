-- ============================================================
-- Migration 005 — RPC replace_user_sessions (transactionnel)
-- Remplace toutes les sessions d'un utilisateur en une seule
-- transaction, éliminant le risque de perte de données.
-- ============================================================

CREATE OR REPLACE FUNCTION private.replace_user_sessions_internal(
  p_user_id UUID,
  p_sessions JSONB
)
RETURNS SETOF sessions
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM sessions WHERE user_id = p_user_id;

  RETURN QUERY
  INSERT INTO sessions (user_id, day_of_week, start_time, end_time, subject, session_type, pedagogical_note)
  SELECT
    p_user_id,
    (elem->>'day_of_week')::day_of_week,
    (elem->>'start_time')::TIME,
    (elem->>'end_time')::TIME,
    elem->>'subject',
    COALESCE((elem->>'session_type')::session_type, 'review'::session_type),
    elem->>'pedagogical_note'
  FROM JSONB_ARRAY_ELEMENTS(p_sessions) AS elem
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION private.replace_user_sessions_internal(UUID, JSONB) FROM PUBLIC, anon;

-- Public wrapper accessible via Supabase REST API
CREATE OR REPLACE FUNCTION public.replace_user_sessions(
  p_user_id UUID,
  p_sessions JSONB
)
RETURNS SETOF sessions
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized' USING HINT = 'You can only replace your own sessions';
  END IF;

  RETURN QUERY SELECT * FROM private.replace_user_sessions_internal(p_user_id, p_sessions);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_user_sessions(UUID, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.replace_user_sessions(UUID, JSONB) TO authenticated;
