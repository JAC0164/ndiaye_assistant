-- ============================================================
-- Migration 009 — Suppression de la RPC inutilisée
-- get_coefficients_by_class_name (remplacée par un JOIN direct)
-- ============================================================

DROP FUNCTION IF EXISTS public.get_coefficients_by_class_name(TEXT);
