const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
const ts = require('typescript')

function loadTsModule(relativePath, env = {}) {
  const previousEnv = {}
  for (const [key, value] of Object.entries(env)) {
    previousEnv[key] = process.env[key]
    process.env[key] = value
  }

  try {
    const filename = path.join(process.cwd(), relativePath)
    const source = fs.readFileSync(filename, 'utf8')
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText

    const mod = { exports: {} }
    const wrapped = Module.wrap(transpiled)
    const script = new vm.Script(wrapped, { filename })
    const requireFromFile = Module.createRequire(filename)
    script.runInThisContext()(mod.exports, requireFromFile, mod, filename, path.dirname(filename))
    return mod.exports
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('server logger filters by clientRequestId and deduplicates persisted/buffer entries', t => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-dm-logs-'))
  t.after(() => fs.rmSync(logDir, { recursive: true, force: true }))

  const logger = loadTsModule('lib/server-logger.ts', {
    APP_LOG_PERSIST_DIR: logDir,
    APP_LOG_PERSIST_ENABLED: 'true',
    APP_LOG_BUFFER_ENABLED: 'true',
    APP_LOG_LEVEL: 'debug',
    APP_LOG_INCLUDE_TEXT: 'true',
  })

  logger.logEvent('info', 'test.first', {
    requestId: 'request-a',
    clientRequestId: 'client-a',
    sessionId: 'session-a',
  })
  logger.logEvent('warn', 'test.second', {
    requestId: 'request-b',
    clientRequestId: 'client-b',
    sessionId: 'session-a',
  })

  const all = logger.getLogEvents({ limit: 10 })
  assert.equal(all.source, 'combined')
  assert.equal(all.totalBuffered, 2)
  assert.equal(all.totalPersisted, 2)
  assert.deepEqual(all.entries.map(entry => entry.event), ['test.first', 'test.second'])

  const filtered = logger.getLogEvents({ clientRequestId: 'CLIENT-A' })
  assert.equal(filtered.entries.length, 1)
  assert.equal(filtered.entries[0].event, 'test.first')
  assert.equal(filtered.entries[0].payload.clientRequestId, 'client-a')
})
