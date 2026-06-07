-- ============================================================
-- Migration 006 — RPC get_coefficients_by_class_name (JOIN optimisé)
-- Remplace la double requête (classes -> coefficients) par un
-- JOIN unique côté serveur.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_coefficients_by_class_name(
  p_class_name TEXT
)
RETURNS SETOF coefficients
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT c.*
  FROM coefficients c
  JOIN classes cl ON cl.id = c.class_id
  WHERE cl.name = p_class_name
  ORDER BY c.coefficient DESC;
END;
$$;
