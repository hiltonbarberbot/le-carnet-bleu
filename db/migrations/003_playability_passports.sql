CREATE TABLE IF NOT EXISTS mystery_playable_storylines (
  owner_id text NOT NULL,
  fingerprint text NOT NULL,
  passport jsonb NOT NULL,
  certified_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id, fingerprint),
  CONSTRAINT mystery_playable_storylines_definition_fk
    FOREIGN KEY (owner_id, fingerprint)
    REFERENCES mystery_storylines (owner_id, fingerprint)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

ALTER TABLE mystery_games
  ADD CONSTRAINT mystery_games_playability_fk
  FOREIGN KEY (owner_id, storyline_fingerprint)
  REFERENCES mystery_playable_storylines (owner_id, fingerprint)
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;
