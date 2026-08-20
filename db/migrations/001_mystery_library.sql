CREATE TABLE IF NOT EXISTS mystery_storylines (
  owner_id text NOT NULL,
  storyline_id text NOT NULL,
  fingerprint text NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS mystery_storylines_owner_updated_idx
  ON mystery_storylines (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS mystery_games (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  storyline_fingerprint text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT mystery_games_storyline_fk
    FOREIGN KEY (owner_id, storyline_fingerprint)
    REFERENCES mystery_storylines (owner_id, fingerprint)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS mystery_games_owner_updated_idx
  ON mystery_games (owner_id, updated_at DESC);
