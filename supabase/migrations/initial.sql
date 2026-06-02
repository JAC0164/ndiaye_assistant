-- ============================================================
-- Initial migration — Ndiaye Assistant
-- Senegalese school structure + weekly schedule
-- ============================================================

-- Enum types
DO $$ BEGIN
  CREATE TYPE day_of_week AS ENUM (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE session_type AS ENUM (
    'course', 'td', 'tp', 'review', 'break'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. School levels (6ème → Terminale)
CREATE TABLE IF NOT EXISTS school_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Series (S1, S2, L, STEG, etc.)
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  level_id UUID NOT NULL REFERENCES school_levels(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Classes (e.g. "Seconde S1", "Terminale L")
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  level_id UUID NOT NULL REFERENCES school_levels(id) ON DELETE CASCADE,
  series_id UUID REFERENCES series(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. Subject coefficients per class
CREATE TABLE IF NOT EXISTS coefficients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  coefficient INTEGER NOT NULL CHECK (coefficient > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject)
);

-- 5. Weekly recurring schedule (sessions)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week day_of_week NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  subject TEXT NOT NULL,
  session_type session_type NOT NULL DEFAULT 'course',
  pedagogical_note TEXT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_time_range CHECK (end_time > start_time)
);

-- Composite index for user + day queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_day
  ON sessions(user_id, day_of_week);

-- Indexes on frequent foreign keys
CREATE INDEX IF NOT EXISTS idx_coefficients_class_id ON coefficients(class_id);
CREATE INDEX IF NOT EXISTS idx_series_level_id ON series(level_id);
CREATE INDEX IF NOT EXISTS idx_classes_level_id ON classes(level_id);
CREATE INDEX IF NOT EXISTS idx_classes_series_id ON classes(series_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- sessions: owner-only, requires authentication
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_sessions" ON sessions;
CREATE POLICY "read_own_sessions" ON sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sessions" ON sessions;
CREATE POLICY "insert_own_sessions" ON sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sessions" ON sessions;
CREATE POLICY "update_own_sessions" ON sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sessions" ON sessions;
CREATE POLICY "delete_own_sessions" ON sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Reference tables: public read, mutations restricted to service_role only
ALTER TABLE school_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coefficients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_levels" ON school_levels;
CREATE POLICY "public_read_levels" ON school_levels
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_read_series" ON series;
CREATE POLICY "public_read_series" ON series
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_read_classes" ON classes;
CREATE POLICY "public_read_classes" ON classes
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_read_coefficients" ON coefficients;
CREATE POLICY "public_read_coefficients" ON coefficients
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies on reference tables:
-- only service_role (bypassing RLS) can mutate them.

-- Profiles table (auto-created on signup)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Profiles RLS: owner-only, requires auth
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_profile" ON profiles;
CREATE POLICY "read_own_profile" ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- INTERNAL SCHEMA for trigger-only functions
-- Not exposed via REST API → no anon/authenticated EXECUTE risk
-- ============================================================
CREATE SCHEMA IF NOT EXISTS private;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fallback_name TEXT;
BEGIN
  fallback_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'display_name',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'User'
  );

  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), fallback_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Revoke all EXECUTE from public roles for defense-in-depth
REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

-- Trigger for updated_at on all tables that have the column
CREATE OR REPLACE FUNCTION private.trigger_set_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Revoke all EXECUTE from public roles
REVOKE ALL ON FUNCTION private.trigger_set_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions;
CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION private.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_school_levels_updated_at ON school_levels;
CREATE TRIGGER trg_school_levels_updated_at
  BEFORE UPDATE ON school_levels
  FOR EACH ROW
  EXECUTE FUNCTION private.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_series_updated_at ON series;
CREATE TRIGGER trg_series_updated_at
  BEFORE UPDATE ON series
  FOR EACH ROW
  EXECUTE FUNCTION private.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_classes_updated_at ON classes;
CREATE TRIGGER trg_classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW
  EXECUTE FUNCTION private.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_coefficients_updated_at ON coefficients;
CREATE TRIGGER trg_coefficients_updated_at
  BEFORE UPDATE ON coefficients
  FOR EACH ROW
  EXECUTE FUNCTION private.trigger_set_updated_at();

-- Drop old public functions if they exist (triggers recreated above, safe to CASCADE)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_set_updated_at() CASCADE;
