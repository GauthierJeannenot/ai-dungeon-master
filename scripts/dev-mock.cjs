const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const concurrentlyBin = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'concurrently.cmd' : 'concurrently'
)

const env = {
  ...process.env,
  ALLOW_PAID_LLM: 'false',
  LLM_MODE: 'mock',
}

const build = spawnSync(npmCmd, ['run', 'build:mcp'], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (build.status !== 0) {
  if (build.error) {
    console.error(build.error)
  }
  process.exit(build.status ?? 1)
}

const child = spawn(concurrentlyBin, [
  'next dev',
  'node mcp-server/dist/mcp-server/index.js',
], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('error', err => {
  console.error(err)
  process.exit(1)
})

child.on('exit', code => {
  process.exit(code ?? 0)
})
