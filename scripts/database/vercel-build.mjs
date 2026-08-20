import { spawn } from 'node:child_process'

if (process.env.VERCEL_ENV === 'production') {
  await import('./migrate.mjs')
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const build = spawn(npm, ['run', 'build'], {
  env: process.env,
  stdio: 'inherit',
})

const exitCode = await new Promise((resolve, reject) => {
  build.once('error', reject)
  build.once('exit', resolve)
})

if (exitCode !== 0) process.exit(exitCode ?? 1)
