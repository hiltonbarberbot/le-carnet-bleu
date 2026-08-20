import postgres from 'postgres'
import { createStorylineDefinition } from '../definition/create'
import type { StorylineDefinition } from '../definition/contract'
import { validatePersistedGameState } from '../persistence/validate'
import type { ExistingGameState, SeatDraft } from '../types'
import { allocateDossierSeat } from './allocation'
import { DossierIssueError } from './identity'
import type { DossierIssueClaim, DossierIssueGame, DossierIssueRepository } from './repository'

type Row = Record<string, unknown>
type Query = { query(text: string, params?: unknown[]): Promise<Row[]> }
type TransactionalQuery = Query & { transaction<Result>(run: (query: Query) => Promise<Result>): Promise<Result> }

type GameRow = Row & {
  id: string
  version: number
  state: unknown
  definition: unknown
}

function readClaim(row: Row): DossierIssueClaim {
  return {
    participantId: String(row.participant_id),
    participantName: String(row.participant_name),
    roleId: String(row.role_id),
    issuedAt: new Date(row.issued_at as string | Date).toISOString(),
  }
}

async function readGame(query: Query, issueCode: string, lock = false): Promise<DossierIssueGame | undefined> {
  const rows = await query.query(
    `SELECT register.issue_code, g.id, g.version, g.state, s.definition
       FROM mystery_game_issue_registers register
       JOIN mystery_games g
         ON g.owner_id = register.owner_id
        AND g.id = register.game_id
       JOIN mystery_storylines s
         ON s.owner_id = g.owner_id
        AND s.fingerprint = g.storyline_fingerprint
      WHERE register.issue_code = $1::uuid
      LIMIT 1${lock ? ' FOR UPDATE OF g' : ''}`,
    [issueCode],
  )
  if (!rows[0]) return undefined
  const row = rows[0] as GameRow
  const storyline = createStorylineDefinition(row.definition)
  const state = validatePersistedGameState(storyline, row.state)
  const claims = await query.query(
    `SELECT participant_id, participant_name, role_id, issued_at
       FROM mystery_game_issues
      WHERE issue_code = $1::uuid
      ORDER BY issued_at ASC`,
    [issueCode],
  )
  return {
    issueCode: String(row.issue_code),
    gameId: row.id,
    version: Number(row.version),
    state,
    storyline,
    claims: claims.map(readClaim),
  }
}

function assignName(state: Extract<ExistingGameState, { phase: 'enrolling' }>, seat: SeatDraft, participantName: string) {
  return {
    ...state,
    setup: {
      ...state.setup,
      seats: state.setup.seats.map(item => item.roleId === seat.roleId ? { ...item, humanName: participantName } : item),
    },
  }
}

export function createPostgresDossierIssueRepository(sql: TransactionalQuery): DossierIssueRepository {
  return {
    async findOrCreateIssueCode(ownerId, gameId) {
      const rows = await sql.query(
        `INSERT INTO mystery_game_issue_registers (owner_id, game_id)
         SELECT owner_id, id
           FROM mystery_games
          WHERE owner_id = $1 AND id = $2
         ON CONFLICT (owner_id, game_id) DO UPDATE
           SET game_id = EXCLUDED.game_id
         RETURNING issue_code`,
        [ownerId, gameId],
      )
      return rows[0] ? String(rows[0].issue_code) : undefined
    },
    findGame(issueCode) {
      return readGame(sql, issueCode)
    },
    claim(issueCode, participantId, participantName) {
      return sql.transaction(async query => {
        const game = await readGame(query, issueCode, true)
        if (!game) return undefined
        if (game.claims.some(claim => claim.participantId === participantId)) return game
        const seat = allocateDossierSeat(game, participantId)
        if (game.state.phase !== 'enrolling') throw new DossierIssueError('issuing_closed', 'This game has already locked its dossier assignments.')
        const state = assignName(game.state, seat, participantName)
        await query.query(
          `INSERT INTO mystery_game_issues (issue_code, participant_id, participant_name, role_id)
           VALUES ($1::uuid, $2, $3, $4)`,
          [issueCode, participantId, participantName, seat.roleId],
        )
        await query.query(
          `UPDATE mystery_games
              SET state = $2::text::jsonb,
                  version = version + 1,
                  updated_at = NOW()
             FROM mystery_game_issue_registers register
            WHERE register.issue_code = $1::uuid
              AND mystery_games.owner_id = register.owner_id
              AND mystery_games.id = register.game_id`,
          [issueCode, JSON.stringify(state)],
        )
        return readGame(query, issueCode)
      })
    },
  }
}

let repository: DossierIssueRepository | undefined

export function getDossierIssueRepository() {
  if (repository) return repository
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required for dossier issue.')
  const sql = postgres(databaseUrl, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 20 })
  const query = (connection: { unsafe(text: string, params?: never[]): Promise<Iterable<Row>> }): Query => ({
    query: async (text, params = []) => [...await connection.unsafe(text, params as never[])],
  })
  repository = createPostgresDossierIssueRepository({
    ...query(sql),
    transaction: async <Result>(run: (query: Query) => Promise<Result>) => (
      await sql.begin(transaction => run(query(transaction))) as Result
    ),
  })
  return repository
}
