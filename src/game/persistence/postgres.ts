import postgres from 'postgres'
import { createStorylineDefinition } from '../definition/create'
import type { StorylineDefinition } from '../definition/contract'
import type { ExistingGameState } from '../types'
import type {
  GameLibraryRepository,
  LibraryImport,
  LibraryScope,
  NewPersistedGame,
  PersistedGame,
} from './repository'
import { validatePersistedGameState } from './validate'
import {
  storylinePlayabilityPassportPassed,
  storylinePassportIssuedAt,
  validateStorylinePlayabilityPassport,
  type StorylinePlayabilityPassport,
} from '../story/grambois/passport'

type QueryRow = Record<string, unknown>

export type PostgresQuery = {
  query(query: string, params?: unknown[]): Promise<QueryRow[]>
}

type StorylineRow = QueryRow & {
  definition: unknown
}

type ReadinessRow = QueryRow & {
  passport: unknown
  definition: unknown
}

type GameRow = QueryRow & {
  id: string
  storyline_fingerprint: string
  version: number
  state: unknown
  created_at: string | Date
  updated_at: string | Date
  definition: unknown
}

function asIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function readStoryline(row: StorylineRow) {
  return createStorylineDefinition(row.definition)
}

function readReadiness(row: ReadinessRow) {
  const storyline = readStoryline(row)
  const passport = row.passport as StorylinePlayabilityPassport
  const errors = validateStorylinePlayabilityPassport(storyline, passport)
  if (errors.length || !storylinePlayabilityPassportPassed(storyline, passport)) {
    throw new Error(`Stored playability passport is invalid: ${errors.join('; ') || 'required checks did not pass'}`)
  }
  return passport
}

function readGame(row: GameRow): PersistedGame {
  const storyline = readStoryline(row)
  const state = validatePersistedGameState(storyline, row.state)
  if (state.id !== row.id) throw new Error(`Stored game ${row.id} has a mismatched state id.`)
  return {
    id: row.id,
    storylineFingerprint: row.storyline_fingerprint,
    version: Number(row.version),
    state,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  }
}

function gameSelection(where: string) {
  return `
    SELECT g.id, g.storyline_fingerprint, g.version, g.state, g.created_at, g.updated_at,
           s.definition
      FROM mystery_games g
      JOIN mystery_storylines s
        ON s.owner_id = g.owner_id
       AND s.fingerprint = g.storyline_fingerprint
      JOIN mystery_playable_storylines playable
        ON playable.owner_id = g.owner_id
       AND playable.fingerprint = g.storyline_fingerprint
     ${where}`
}

/** PostgreSQL adapter for local TCP databases and Neon pooled production URLs. */
export function createPostgresGameLibraryRepository(sql: PostgresQuery): GameLibraryRepository {
  return {
    async listStorylines(scope) {
      const rows = await sql.query(
        `SELECT storylines.definition, playable.passport
           FROM mystery_storylines storylines
           JOIN mystery_playable_storylines playable
             ON playable.owner_id = storylines.owner_id
            AND playable.fingerprint = storylines.fingerprint
          WHERE storylines.owner_id = $1
          ORDER BY storylines.created_at ASC`,
        [scope.ownerId],
      )
      return rows.map(row => {
        readReadiness(row as ReadinessRow)
        return readStoryline(row as StorylineRow)
      })
    },

    async findStoryline(scope, fingerprint) {
      const rows = await sql.query(
        `SELECT definition
           FROM mystery_storylines
          WHERE owner_id = $1 AND fingerprint = $2
          LIMIT 1`,
        [scope.ownerId, fingerprint],
      )
      return rows[0] ? readStoryline(rows[0] as StorylineRow) : undefined
    },

    async findStorylineReadiness(scope, fingerprint) {
      const rows = await sql.query(
        `SELECT playable.passport, storylines.definition
           FROM mystery_playable_storylines playable
           JOIN mystery_storylines storylines
             ON storylines.owner_id = playable.owner_id
            AND storylines.fingerprint = playable.fingerprint
          WHERE playable.owner_id = $1 AND playable.fingerprint = $2
          LIMIT 1`,
        [scope.ownerId, fingerprint],
      )
      return rows[0] ? readReadiness(rows[0] as ReadinessRow) : undefined
    },

    async saveStoryline(scope, storyline) {
      await sql.query(
        `INSERT INTO mystery_storylines (owner_id, storyline_id, fingerprint, definition)
         VALUES ($1, $2, $3, $4::text::jsonb)
         ON CONFLICT (owner_id, fingerprint) DO UPDATE
           SET storyline_id = EXCLUDED.storyline_id,
               definition = EXCLUDED.definition,
               updated_at = NOW()`,
        [scope.ownerId, storyline.id, storyline.fingerprint, JSON.stringify(storyline)],
      )
    },

    async certifyStoryline(scope, storyline, readiness) {
      const errors = validateStorylinePlayabilityPassport(storyline, readiness)
      if (errors.length || !storylinePlayabilityPassportPassed(storyline, readiness)) {
        throw new Error(`A storyline cannot be certified: ${errors.join('; ') || 'the readiness gate did not pass'}`)
      }
      await sql.query(
        `WITH saved_storyline AS (
           INSERT INTO mystery_storylines (owner_id, storyline_id, fingerprint, definition)
           VALUES ($1, $2, $3, $4::text::jsonb)
           ON CONFLICT (owner_id, fingerprint) DO UPDATE
             SET storyline_id = EXCLUDED.storyline_id,
                 definition = EXCLUDED.definition,
                 updated_at = NOW()
           RETURNING owner_id, fingerprint
         )
         INSERT INTO mystery_playable_storylines (owner_id, fingerprint, passport, certified_at)
         SELECT owner_id, fingerprint, $5::text::jsonb, $6::timestamptz
           FROM saved_storyline
         ON CONFLICT (owner_id, fingerprint) DO UPDATE
           SET passport = EXCLUDED.passport,
               certified_at = EXCLUDED.certified_at`,
        [
          scope.ownerId,
          storyline.id,
          storyline.fingerprint,
          JSON.stringify(storyline),
          JSON.stringify(readiness),
          storylinePassportIssuedAt(readiness),
        ],
      )
    },

    async listGames(scope) {
      const rows = await sql.query(
        `${gameSelection('WHERE g.owner_id = $1')} ORDER BY g.updated_at DESC`,
        [scope.ownerId],
      )
      return rows.map(row => readGame(row as GameRow))
    },

    async findGame(scope, id) {
      const rows = await sql.query(
        `${gameSelection('WHERE g.owner_id = $1 AND g.id = $2')} LIMIT 1`,
        [scope.ownerId, id],
      )
      return rows[0] ? readGame(rows[0] as GameRow) : undefined
    },

    async createGame(scope, game) {
      const rows = await sql.query(
        `WITH inserted AS (
           INSERT INTO mystery_games (id, owner_id, storyline_fingerprint, state)
           VALUES ($1, $2, $3, $4::text::jsonb)
           RETURNING id, owner_id, storyline_fingerprint, version, state, created_at, updated_at
         )
         SELECT g.id, g.storyline_fingerprint, g.version, g.state, g.created_at, g.updated_at,
                s.definition
           FROM inserted g
           JOIN mystery_storylines s
             ON s.owner_id = g.owner_id
            AND s.fingerprint = g.storyline_fingerprint`,
        [game.id, scope.ownerId, game.storylineFingerprint, JSON.stringify(game.state)],
      )
      if (!rows[0]) throw new Error('The game could not be persisted.')
      return readGame(rows[0] as GameRow)
    },

    async updateGame(scope, id, expectedVersion, state) {
      const rows = await sql.query(
        `WITH updated AS (
           UPDATE mystery_games
              SET state = $4::text::jsonb,
                  version = version + 1,
                  updated_at = NOW()
            WHERE owner_id = $1 AND id = $2 AND version = $3
            RETURNING id, owner_id, storyline_fingerprint, version, state, created_at, updated_at
         )
         SELECT g.id, g.storyline_fingerprint, g.version, g.state, g.created_at, g.updated_at,
                s.definition
           FROM updated g
           JOIN mystery_storylines s
             ON s.owner_id = g.owner_id
            AND s.fingerprint = g.storyline_fingerprint`,
        [scope.ownerId, id, expectedVersion, JSON.stringify(state)],
      )
      return rows[0] ? readGame(rows[0] as GameRow) : undefined
    },

    async deleteGame(scope, id, expectedVersion) {
      const rows = await sql.query(
        `DELETE FROM mystery_games
          WHERE owner_id = $1 AND id = $2 AND version = $3
          RETURNING id`,
        [scope.ownerId, id, expectedVersion],
      )
      return rows.length === 1
    },

    async importLibrary(scope, library) {
      if (!library.storylines.length && !library.games.length) {
        return { storylinesImported: 0, gamesImported: 0 }
      }
      const storylines = JSON.stringify(library.storylines.map(storyline => ({
        storylineId: storyline.id,
        fingerprint: storyline.fingerprint,
        definition: storyline,
      })))
      const games = JSON.stringify(library.games.map(game => ({
        id: game.id,
        storylineFingerprint: game.storylineFingerprint,
        state: game.state,
      })))
      const rows = await sql.query(
        `WITH storyline_input AS (
           SELECT $1::text AS owner_id, item
             FROM jsonb_array_elements($2::text::jsonb) item
         ),
         saved_storylines AS (
           INSERT INTO mystery_storylines (owner_id, storyline_id, fingerprint, definition)
           SELECT owner_id,
                  item->>'storylineId',
                  item->>'fingerprint',
                  item->'definition'
             FROM storyline_input
           ON CONFLICT (owner_id, fingerprint) DO UPDATE
             SET storyline_id = EXCLUDED.storyline_id,
                 definition = EXCLUDED.definition,
                 updated_at = NOW()
           RETURNING fingerprint
         ),
         game_input AS (
           SELECT $1::text AS owner_id, item
             FROM jsonb_array_elements($3::text::jsonb) item
         ),
         saved_games AS (
           INSERT INTO mystery_games (id, owner_id, storyline_fingerprint, state)
           SELECT games.item->>'id',
                  games.owner_id,
                  games.item->>'storylineFingerprint',
                  games.item->'state'
             FROM game_input games
             JOIN saved_storylines storylines
               ON storylines.fingerprint = games.item->>'storylineFingerprint'
           ON CONFLICT (owner_id, id) DO NOTHING
           RETURNING id
         )
         SELECT (SELECT COUNT(*)::int FROM saved_storylines) AS storylines_imported,
                (SELECT COUNT(*)::int FROM saved_games) AS games_imported`,
        [scope.ownerId, storylines, games],
      )
      const row = rows[0] ?? {}
      return {
        storylinesImported: Number(row.storylines_imported ?? 0),
        gamesImported: Number(row.games_imported ?? 0),
      }
    },
  }
}

let repository: GameLibraryRepository | undefined

export function getGameLibraryRepository() {
  if (repository) return repository
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required for game persistence.')
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
  })
  repository = createPostgresGameLibraryRepository({
    query: async (query, params = []) => [...await sql.unsafe(query, params as never[])],
  })
  return repository
}

export function resetGameLibraryRepositoryForTests() {
  repository = undefined
}
