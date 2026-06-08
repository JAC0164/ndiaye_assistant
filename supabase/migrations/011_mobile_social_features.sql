-- 1. Types ENUM requis pour l'adaptation mobile
CREATE TYPE feedback_rating AS ENUM ('DIFFICILE', 'MOYEN', 'MAITRISE');
CREATE TYPE friendship_status AS ENUM ('PENDING', 'ACCEPTED');

-- 2. Mise à jour de la table historique pour inclure le feedback simplifié
ALTER TABLE historique ADD COLUMN feedback feedback_rating NOT NULL DEFAULT 'MOYEN';
-- Note pour la migration : mapper les anciens 1-2 (DIFFICILE), 3 (MOYEN), 4-5 (MAITRISE)

-- 3. Extension de la table profiles pour la gestion des Win Streaks
ALTER TABLE profiles ADD COLUMN current_streak INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN longest_streak INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN last_streak_date DATE;

-- 4. Table pour la file d'attente des Push Tokens (Firebase FCM)
CREATE TABLE user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    token TEXT NOT NULL,
    platform TEXT NOT NULL, -- 'android' ou 'ios'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, device_id)
);

-- 5. Table Sociale : Relations d'amitié (Simplifiée pour l'effort)
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status friendship_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(sender_id, receiver_id)
);

-- 6. Index pour optimiser le classement basé sur l'effort (Heures révisées)
-- Permet de calculer rapidement le total minutes par semaine pour le leaderboard
CREATE INDEX idx_historique_user_date ON historique(user_id, completed_at);

-- 7. RLS : user_push_tokens
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own push tokens"
  ON user_push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own push tokens"
  ON user_push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own push tokens"
  ON user_push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users can delete own push tokens"
  ON user_push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- 8. RLS : friendships
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read their friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "users can send friend requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "users can update received requests"
  ON friendships FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id AND status = 'ACCEPTED');

CREATE POLICY "users can delete their sent requests"
  ON friendships FOR DELETE
  USING (auth.uid() = sender_id);
