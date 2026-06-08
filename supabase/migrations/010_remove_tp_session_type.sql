ALTER TABLE sessions
  ALTER COLUMN session_type DROP DEFAULT;

ALTER TYPE session_type RENAME TO session_type_old;

CREATE TYPE session_type AS ENUM (
  'td', 'review', 'break'
);

ALTER TABLE sessions
  ALTER COLUMN session_type TYPE session_type
  USING session_type::text::session_type;

ALTER TABLE historique
  ALTER COLUMN session_type TYPE session_type
  USING session_type::text::session_type;

DROP TYPE session_type_old;

ALTER TABLE sessions
  ALTER COLUMN session_type SET DEFAULT 'review';
