import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

// Each successful build is immutable. Existing turns keep their process and
// tests may rebuild dist/ without changing the code used by a development turn.
export function createDevelopmentMcpBuilder(
  projectRoot: string,
  compilerPath = path.join(projectRoot, 'node_modules/typescript/bin/tsc'),
) {
  let current: { fingerprint: string; serverPath: string } | undefined
  let pending: Promise<string> | undefined

  async function fingerprint(): Promise<string> {
    const hash = createHash('sha256')
    async function visit(directory: string): Promise<void> {
      const entries = await fs.readdir(path.join(projectRoot, directory), { withFileTypes: true })
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = path.join(directory, entry.name)
        if (entry.isDirectory() && entry.name !== 'dist' && entry.name !== 'node_modules') await visit(relative)
        else if (entry.isFile() && /\.(ts|json)$/.test(entry.name)) {
          hash.update(relative).update('\0').update(await fs.readFile(path.join(projectRoot, relative))).update('\0')
        }
      }
    }
    for (const directory of ['mcp-server', 'lib', 'adventures', 'characters']) await visit(directory)
    for (const filename of ['tsconfig.json', 'package-lock.json']) {
      hash.update(filename).update(await fs.readFile(path.join(projectRoot, filename)))
    }
    return hash.digest('hex')
  }

  async function build(): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await fingerprint()
      if (current?.fingerprint === before) return current.serverPath
      const output = path.join(projectRoot, '.data/dev-mcp', randomUUID())
      await run(process.execPath, [compilerPath, '-p', path.join(projectRoot, 'mcp-server/tsconfig.json'),
        '--outDir', output, '--noEmitOnError'], { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 })
        .catch(error => { throw new Error(`Compilation MCP de développement échouée :\n${error.stdout || error.message}`) })
      // Edits during compilation must never publish a mixture of revisions.
      if (before !== await fingerprint()) continue
      const serverPath = path.join(output, 'mcp-server/index.js')
      await fs.access(serverPath)
      current = { fingerprint: before, serverPath }
      return serverPath
    }
    throw new Error('Les sources MCP changent encore. Réessaie une fois les fichiers enregistrés.')
  }

  return function getServerPath(): Promise<string> {
    // Different sessions share the build, but keep independent engine processes.
    pending ??= build().finally(() => { pending = undefined })
    return pending
  }
}

const developmentGlobal = globalThis as typeof globalThis & {
  __aiDmDevelopmentMcpBuilder?: ReturnType<typeof createDevelopmentMcpBuilder>
}

export function getDevelopmentMcpServerPath(): Promise<string> {
  developmentGlobal.__aiDmDevelopmentMcpBuilder ??= createDevelopmentMcpBuilder(process.cwd())
  return developmentGlobal.__aiDmDevelopmentMcpBuilder()
}
