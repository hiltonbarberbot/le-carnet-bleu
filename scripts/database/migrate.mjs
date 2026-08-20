import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required to run database migrations.')

const migrationsDirectory = path.join(process.cwd(), 'db', 'migrations')
const migrationFiles = (await readdir(migrationsDirectory))
  .filter(file => file.endsWith('.sql'))
  .sort()

const sql = postgres(databaseUrl, { max: 1, prepare: false })

try {
  await sql`
    CREATE TABLE IF NOT EXISTS mystery_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `

  for (const file of migrationFiles) {
    const [applied] = await sql`SELECT name FROM mystery_migrations WHERE name = ${file}`
    if (applied) continue
    const migration = await readFile(path.join(migrationsDirectory, file), 'utf8')
    await sql.begin(async transaction => {
      await transaction.unsafe(migration)
      await transaction`INSERT INTO mystery_migrations (name) VALUES (${file})`
    })
    process.stdout.write(`Applied ${file}\n`)
  }
} finally {
  await sql.end()
}
