ALTER TABLE mystery_games
  DROP CONSTRAINT mystery_games_pkey;

ALTER TABLE mystery_games
  ADD PRIMARY KEY (owner_id, id);
