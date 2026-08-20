CREATE TABLE IF NOT EXISTS mystery_game_issue_registers (
  issue_code uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  game_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, game_id),
  FOREIGN KEY (owner_id, game_id)
    REFERENCES mystery_games (owner_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mystery_game_issues (
  issue_code uuid NOT NULL REFERENCES mystery_game_issue_registers (issue_code) ON DELETE CASCADE,
  participant_id text NOT NULL,
  participant_name text NOT NULL,
  role_id text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (issue_code, participant_id),
  UNIQUE (issue_code, role_id)
);
