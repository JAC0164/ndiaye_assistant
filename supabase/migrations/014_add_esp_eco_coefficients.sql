-- Migration: Add Spanish (ESP) and Economics (ECO) coefficients for relevant classes.
-- Spanish (ESP) LV2:
-- - Quatrième: coefficient 2
-- - Troisième: coefficient 2
-- - Terminale L1: coefficient 2
-- - Terminale L2: coefficient 2
-- - Terminale L'1: coefficient 4
-- - Terminale G: coefficient 2
--
-- Economics (ECO) Option:
-- - Terminale L2: coefficient 2

-- Quatrième
INSERT INTO public.coefficients (class_id, subject, coefficient)
VALUES ('00000000-0000-0000-0000-000000000101', 'ESP', 2)
ON CONFLICT (class_id, subject) DO UPDATE SET coefficient = EXCLUDED.coefficient;

-- Troisième
INSERT INTO public.coefficients (class_id, subject, coefficient)
VALUES ('00000000-0000-0000-0000-000000000102', 'ESP', 2)
ON CONFLICT (class_id, subject) DO UPDATE SET coefficient = EXCLUDED.coefficient;

-- Terminale L1
INSERT INTO public.coefficients (class_id, subject, coefficient)
VALUES ('00000000-0000-0000-0000-000000000107', 'ESP', 2)
ON CONFLICT (class_id, subject) DO UPDATE SET coefficient = EXCLUDED.coefficient;

-- Terminale L2
INSERT INTO public.coefficients (class_id, subject, coefficient)
VALUES 
  ('00000000-0000-0000-0000-000000000108', 'ESP', 2),
  ('00000000-0000-0000-0000-000000000108', 'ECO', 2)
ON CONFLICT (class_id, subject) DO UPDATE SET coefficient = EXCLUDED.coefficient;

-- Terminale L'1
INSERT INTO public.coefficients (class_id, subject, coefficient)
VALUES ('00000000-0000-0000-0000-000000000111', 'ESP', 4)
ON CONFLICT (class_id, subject) DO UPDATE SET coefficient = EXCLUDED.coefficient;

-- Terminale G
INSERT INTO public.coefficients (class_id, subject, coefficient)
VALUES ('00000000-0000-0000-0000-000000000131', 'ESP', 2)
ON CONFLICT (class_id, subject) DO UPDATE SET coefficient = EXCLUDED.coefficient;
