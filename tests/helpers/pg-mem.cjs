'use strict'

// Harnais Postgres en mémoire partagé par les tests et le playtest.
//
// Backend unique = Postgres : les tests n'ont plus de repli fichier. pg-mem
// émule Postgres au niveau du driver `pg` ; on l'injecte dans lib/db.ts via
// __setDbPoolForTests, exactement comme le faisait tests/db-stores.test.cjs.
//
// ⚠️ ORDRE CRITIQUE : installPgMem() pose DATABASE_URL et installe le hook
// ts-require AVANT tout require d'un module de lib/. lib/auth.ts lit
// isDatabaseEnabled() à L'IMPORT (config NextAuth) — d'où l'obligation
// d'appeler ce helper en PREMIER dans le fichier de test, avant de requérir
// quoi que ce soit de lib/ ou app/.
//
// Usage :
//   const { installPgMem } = require('./helpers/pg-mem.cjs')
//   // (poser ici les env de config lues à l'import : GUEST_MESSAGE_LIMIT…)
//   const pg = installPgMem()
//   const store = require('<cwd>/lib/session-store.ts')  // voit déjà la DB
//   test.after(() => pg.restore())

const path = require('node:path')
const { installTsRequireWithAliases } = require('./ts-require.cjs')

// URL factice : la seule chose qui compte est que DATABASE_URL soit "truthy"
// (isDatabaseEnabled), le pool réel étant remplacé par pg-mem juste après.
const IN_MEMORY_DATABASE_URL = 'postgres://pg-mem/in-memory'

function installPgMem() {
  // Silence les logs par défaut (surchargeable : un test peut poser ces vars
  // avant d'appeler le helper, on ne les écrase pas si déjà définies).
  process.env.APP_LOG_BUFFER_ENABLED ??= 'false'
  process.env.APP_LOG_LEVEL ??= 'error'
  process.env.APP_LOG_PERSIST_ENABLED ??= 'false'
  process.env.DATABASE_URL = IN_MEMORY_DATABASE_URL

  const restoreTsRequire = installTsRequireWithAliases()

  const { newDb } = require('pg-mem')
  const db = require(path.join(process.cwd(), 'lib/db.ts'))

  const mem = newDb()
  const { Pool } = mem.adapters.createPg()
  const pool = new Pool()
  db.__setDbPoolForTests(pool)

  return {
    db,
    mem,
    pool,
    restore() {
      restoreTsRequire()
    },
  }
}

module.exports = { installPgMem }
