#!/usr/bin/env node
'use strict'

// Import ponctuel des stores fichiers (.data/sessions, .data/credits) vers
// Postgres, pour une bascule sans perte de données.
// Usage :  DATABASE_URL=postgres://... node scripts/db-import-file-stores.cjs
//
// ⚠️ Les soldes utilisateurs du mode JWT sont clés par "provider:accountId" ;
// en mode Postgres, la clé devient users.id. L'import copie les enregistrements
// tels quels — un utilisateur récupère son ancien solde seulement si sa clé
// n'a pas changé. Pour réattribuer un solde à un compte migré, mettre à jour
// user_credits.user_id à la main après le premier login.

const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL manquante.')
  process.exit(1)
}

const previousResolve = Module._resolveFilename
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return previousResolve.call(this, path.join(process.cwd(), request.slice(2)), parent, isMain, options)
  }
  return previousResolve.call(this, request, parent, isMain, options)
}
Module._extensions['.ts'] = function loadTs(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  mod._compile(output, filename)
}

async function main() {
  // Force la lecture FICHIER côté source malgré DATABASE_URL : on lit les
  // fonctions list* (toujours fichiers) et on écrit via le backend db.
  const credits = require(path.join(process.cwd(), 'lib/credits-store.ts'))
  const creditsDb = require(path.join(process.cwd(), 'lib/credits-store-db.ts'))
  const sessions = require(path.join(process.cwd(), 'lib/session-store.ts'))
  const sessionsDb = require(path.join(process.cwd(), 'lib/session-store-db.ts'))
  const { ensureSchema, getPool } = require(path.join(process.cwd(), 'lib/db.ts'))

  await ensureSchema()

  const userRecords = await credits.listFileUserCredits()
  for (const record of userRecords) {
    await creditsDb.importUserCredits(record)
  }
  console.log(`Crédits utilisateurs importés : ${userRecords.length}`)

  const guestRecords = await credits.listFileGuestUsage()
  for (const record of guestRecords) {
    await creditsDb.importGuestUsage(record)
  }
  console.log(`Quotas invités importés : ${guestRecords.length}`)

  const gameSessions = await sessions.listFileSessions()
  for (const session of gameSessions) {
    await sessionsDb.saveSession(session.sessionId, {
      gameState: session.gameState,
      history: session.history,
      summaryContext: session.summaryContext,
      turnTraces: session.turnTraces,
    })
  }
  console.log(`Sessions de jeu importées : ${gameSessions.length}`)

  await getPool().end()
}

main().catch(err => {
  console.error("Échec de l'import :", err.message)
  process.exit(1)
})
